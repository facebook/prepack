/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, type Effects } from "../realm.js";
import { ModuleTracer } from "../utils/modules.js";
import {
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  Value,
  UndefinedValue,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  ArrayValue,
  ObjectValue,
  AbstractObjectValue,
} from "../values/index.js";
import { ReactStatistics, type ReactSerializerState, type ReactEvaluatedNode } from "../serializer/types.js";
import {
  isReactElement,
  valueIsClassComponent,
  forEachArrayValue,
  valueIsLegacyCreateClassComponent,
  valueIsFactoryClassComponent,
  valueIsKnownReactAbstraction,
  getReactSymbol,
  flattenChildren,
  getProperty,
  createReactEvaluatedNode,
  getComponentName,
} from "./utils";
import { Get } from "../methods/index.js";
import invariant from "../invariant.js";
import { Properties } from "../singletons.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { BranchState, type BranchStatusEnum } from "./branching.js";
import {
  getInitialProps,
  getInitialContext,
  createClassInstance,
  createSimpleClassInstance,
  evaluateClassConstructor,
} from "./components.js";
import { ExpectedBailOut, SimpleClassBailOut, NewComponentTreeBranch } from "./errors.js";
import { Completion } from "../completions.js";
import { Logger } from "../utils/logger.js";
import type { ClassComponentMetadata } from "../types.js";

type RenderStrategy = "NORMAL" | "FRAGMENT" | "RELAY_QUERY_RENDERER";

export type BranchReactComponentTree = {
  context: ObjectValue | AbstractObjectValue | null,
  evaluatedNode: ReactEvaluatedNode,
  props: ObjectValue | AbstractObjectValue | null,
  rootValue: ECMAScriptSourceFunctionValue | AbstractValue,
};

export class Reconciler {
  constructor(
    realm: Realm,
    moduleTracer: ModuleTracer,
    statistics: ReactStatistics,
    reactSerializerState: ReactSerializerState,
    simpleClassComponents: Set<Value>,
    branchReactComponentTrees: Array<BranchReactComponentTree>
  ) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.statistics = statistics;
    this.reactSerializerState = reactSerializerState;
    this.simpleClassComponents = simpleClassComponents;
    this.logger = moduleTracer.modules.logger;
    this.branchReactComponentTrees = branchReactComponentTrees;
  }

  realm: Realm;
  moduleTracer: ModuleTracer;
  statistics: ReactStatistics;
  reactSerializerState: ReactSerializerState;
  simpleClassComponents: Set<Value>;
  logger: Logger;
  branchReactComponentTrees: Array<BranchReactComponentTree>;

  render(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractObjectValue | null,
    context: ObjectValue | AbstractObjectValue | null,
    isRoot: boolean,
    evaluatedRootNode: ReactEvaluatedNode
  ): Effects {
    return this.realm.wrapInGlobalEnv(() =>
      this.realm.evaluatePure(() =>
        // TODO: (sebmarkbage): You could use the return value of this to detect if there are any mutations on objects other
        // than newly created ones. Then log those to the error logger. That'll help us track violations in
        // components. :)
        this.realm.evaluateForEffects(
          () => {
            // initialProps and initialContext are created from Flow types from:
            // - if a functional component, the 1st and 2nd paramater of function
            // - if a class component, use this.props and this.context
            // if there are no Flow types for props or context, we will throw a
            // FatalError, unless it's a functional component that has no paramater
            // i.e let MyComponent = () => <div>Hello world</div>
            try {
              let initialProps = props || getInitialProps(this.realm, componentType);
              let initialContext = context || getInitialContext(this.realm, componentType);
              let { result } = this._renderComponent(
                componentType,
                initialProps,
                initialContext,
                "ROOT",
                null,
                evaluatedRootNode
              );
              this.statistics.optimizedTrees++;
              return result;
            } catch (error) {
              // if we get an error and we're not dealing with the root
              // rather than throw a FatalError, we log the error as a warning
              // and continue with the other tree roots
              // TODO: maybe control what levels gets treated as warning/error?
              if (!isRoot) {
                this.logger.logWarning(
                  componentType,
                  `__registerReactComponentRoot() React component tree (branch) failed due to - ${error.message}`
                );
                return this.realm.intrinsics.undefined;
              }
              // if there was a bail-out on the root component in this reconcilation process, then this
              // should be an invariant as the user has explicitly asked for this component to get folded
              if (error instanceof Completion) {
                this.logger.logCompletion(error);
                throw error;
              } else if (error instanceof ExpectedBailOut) {
                let diagnostic = new CompilerDiagnostic(
                  `__registerReactComponentRoot() React component tree (root) failed due to - ${error.message}`,
                  this.realm.currentLocation,
                  "PP0020",
                  "FatalError"
                );
                this.realm.handleError(diagnostic);
                if (this.realm.handleError(diagnostic) === "Fail") throw new FatalError();
              }
              throw error;
            }
          },
          /*state*/ null,
          `react component: ${componentType.getName()}`
        )
      )
    );
  }

  _queueNewComponentTree(
    rootValue: Value,
    evaluatedNode: ReactEvaluatedNode,
    props?: ObjectValue | AbstractObjectValue | null = null,
    context?: ObjectValue | AbstractObjectValue | null = null
  ) {
    invariant(rootValue instanceof ECMAScriptSourceFunctionValue || rootValue instanceof AbstractValue);
    this.branchReactComponentTrees.push({
      evaluatedNode,
      props,
      rootValue,
      context,
    });
  }

  _renderComplexClassComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    classMetadata: ClassComponentMetadata,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ): Value {
    if (branchStatus !== "ROOT") {
      this._queueNewComponentTree(componentType, evaluatedNode);
      evaluatedNode.status = "NEW_TREE";
      throw new NewComponentTreeBranch();
    }
    // create a new instance of this React class component
    let instance = createClassInstance(this.realm, componentType, props, context, classMetadata);
    // get the "render" method off the instance
    let renderMethod = Get(this.realm, instance, "render");
    invariant(
      renderMethod instanceof ECMAScriptSourceFunctionValue && renderMethod.$Call,
      "Expected render method to be a FunctionValue with $Call method"
    );
    // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
    return renderMethod.$Call(instance, []);
  }

  _renderFactoryClassComponent(
    instance: ObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ): Value {
    if (branchStatus !== "ROOT") {
      throw new NewComponentTreeBranch();
    }
    // get the "render" method off the instance
    let renderMethod = Get(this.realm, instance, "render");
    invariant(
      renderMethod instanceof ECMAScriptSourceFunctionValue && renderMethod.$Call,
      "Expected render method to be a FunctionValue with $Call method"
    );
    // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
    return renderMethod.$Call(instance, []);
  }

  _renderSimpleClassComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null
  ): Value {
    // create a new simple instance of this React class component
    let instance = createSimpleClassInstance(this.realm, componentType, props, context);
    // get the "render" method off the instance
    let renderMethod = Get(this.realm, instance, "render");
    invariant(
      renderMethod instanceof ECMAScriptSourceFunctionValue && renderMethod.$Call,
      "Expected render method to be a FunctionValue with $Call method"
    );
    // the render method doesn't have any arguments, so we just assign the context of "this" to be the instance
    return renderMethod.$Call(instance, []);
  }

  _renderFunctionalComponent(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue
  ) {
    invariant(componentType.$Call, "Expected componentType to be a FunctionValue with $Call method");
    return componentType.$Call(this.realm.intrinsics.undefined, [props, context]);
  }

  _getClassComponentMetadata(
    componentType: ECMAScriptSourceFunctionValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue
  ): ClassComponentMetadata {
    if (this.realm.react.classComponentMetadata.has(componentType)) {
      let classMetadata = this.realm.react.classComponentMetadata.get(componentType);
      invariant(classMetadata);
      return classMetadata;
    }
    // get all this assignments in the constructor
    let classMetadata = evaluateClassConstructor(this.realm, componentType, props, context);
    this.realm.react.classComponentMetadata.set(componentType, classMetadata);
    return classMetadata;
  }

  _renderRelayQueryRendererComponent(
    reactElement: ObjectValue,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue
  ) {
    // TODO: for now we do nothing, in the future we want to evaluate the render prop of this component
    return {
      result: reactElement,
      childContext: context,
    };
  }

  _renderComponent(
    componentType: Value,
    props: ObjectValue | AbstractValue | AbstractObjectValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    if (valueIsKnownReactAbstraction(this.realm, componentType)) {
      invariant(componentType instanceof AbstractValue);
      this._queueNewComponentTree(componentType, evaluatedNode);
      evaluatedNode.status = "NEW_TREE";
      throw new NewComponentTreeBranch();
    }
    invariant(componentType instanceof ECMAScriptSourceFunctionValue);
    let value;
    let childContext = context;

    // first we check if it's a legacy class component
    if (valueIsLegacyCreateClassComponent(this.realm, componentType)) {
      throw new ExpectedBailOut("components created with create-react-class are not supported");
    } else if (valueIsClassComponent(this.realm, componentType)) {
      let classMetadata = this._getClassComponentMetadata(componentType, props, context);
      let { instanceProperties, instanceSymbols } = classMetadata;

      // if there were no this assignments we can try and render it as a simple class component
      if (instanceProperties.size === 0 && instanceSymbols.size === 0) {
        // We first need to know what type of class component we're dealing with.
        // A "simple" class component is defined as:
        //
        // - having only a "render" method
        // - having no lifecycle events
        // - having no state
        // - having no instance variables
        //
        // the only things a class component should be able to access on "this" are:
        // - this.props
        // - this.context
        // - this._someRenderMethodX() etc
        //
        // Otherwise, the class component is a "complex" one.
        // To begin with, we don't know what type of component it is, so we try and render it as if it were
        // a simple component using the above heuristics. If an error occurs during this process, we assume
        // that the class wasn't simple, then try again with the "complex" heuristics.
        try {
          value = this._renderSimpleClassComponent(componentType, props, context, branchStatus, branchState);
          this.simpleClassComponents.add(value);
        } catch (error) {
          // if we get back a SimpleClassBailOut error, we know that this class component
          // wasn't a simple one and is likely to be a complex class component instead
          if (error instanceof SimpleClassBailOut) {
            // the component was not simple, so we continue with complex case
          } else {
            // else we rethrow the error
            throw error;
          }
        }
      }
      // handle the complex class component if there is not value
      if (value === undefined) {
        value = this._renderComplexClassComponent(
          componentType,
          props,
          context,
          classMetadata,
          branchStatus,
          branchState,
          evaluatedNode
        );
      }
    } else {
      value = this._renderFunctionalComponent(componentType, props, context);
      if (valueIsFactoryClassComponent(this.realm, value)) {
        invariant(value instanceof ObjectValue);
        // TODO: use this._renderFactoryClassComponent to handle the render method (like a render prop)
        // for now we just return the object
        if (branchStatus !== "ROOT") {
          throw new ExpectedBailOut("non-root factory class components are not suppoted");
        } else {
          return {
            result: value,
            childContext,
          };
        }
      }
    }
    invariant(value !== undefined);
    return {
      result: this._resolveDeeply(
        value,
        context,
        branchStatus === "ROOT" ? "NO_BRANCH" : branchStatus,
        branchState,
        evaluatedNode
      ),
      childContext,
    };
  }

  _getRenderStrategy(value: Value): RenderStrategy {
    // check if it's a ReactRelay.QueryRenderer
    if (this.realm.fbLibraries.reactRelay !== undefined) {
      let QueryRenderer = Get(this.realm, this.realm.fbLibraries.reactRelay, "QueryRenderer");
      if (value === QueryRenderer) {
        return "RELAY_QUERY_RENDERER";
      }
    } else if (value === getReactSymbol("react.fragment", this.realm)) {
      return "FRAGMENT";
    }
    return "NORMAL";
  }

  _resolveDeeply(
    value: Value,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    if (
      value instanceof StringValue ||
      value instanceof NumberValue ||
      value instanceof BooleanValue ||
      value instanceof NullValue ||
      value instanceof UndefinedValue
    ) {
      // terminal values
      return value;
    } else if (value instanceof AbstractValue) {
      let length = value.args.length;
      if (length > 0) {
        let newBranchState = new BranchState();
        // TODO investigate what other kinds than "conditional" might be safe to deeply resolve
        for (let i = 0; i < length; i++) {
          value.args[i] = this._resolveDeeply(value.args[i], context, "NEW_BRANCH", newBranchState, evaluatedNode);
        }
        newBranchState.applyBranchedLogic(this.realm, this.reactSerializerState);
      }
      return value;
    }
    // TODO investigate what about other iterables type objects
    if (value instanceof ArrayValue) {
      this._resolveArray(value, context, branchStatus, branchState, evaluatedNode);
      return value;
    }
    if (value instanceof ObjectValue && isReactElement(value)) {
      // we call value reactElement, to make it clearer what we're dealing with in this block
      let reactElement = value;
      let typeValue = Get(this.realm, reactElement, "type");
      let propsValue = Get(this.realm, reactElement, "props");
      let refValue = Get(this.realm, reactElement, "ref");

      const resolveChildren = () => {
        // terminal host component. Start evaluating its children.
        if (propsValue instanceof ObjectValue && propsValue.properties.has("children")) {
          let childrenValue = getProperty(this.realm, propsValue, "children");

          if (childrenValue instanceof Value) {
            let resolvedChildren = this._resolveDeeply(
              childrenValue,
              context,
              branchStatus,
              branchState,
              evaluatedNode
            );
            // we can optimize further and flatten arrays on non-composite components
            if (resolvedChildren instanceof ArrayValue) {
              resolvedChildren = flattenChildren(this.realm, resolvedChildren);
            }
            if (propsValue.properties.has("children")) {
              propsValue.refuseSerialization = true;
              Properties.Set(this.realm, propsValue, "children", resolvedChildren, true);
              propsValue.refuseSerialization = false;
            }
          }
        }
        return reactElement;
      };

      if (typeValue instanceof StringValue) {
        return resolveChildren();
      }
      // we do not support "ref" on <Component /> ReactElements
      if (!(refValue instanceof NullValue)) {
        invariant(typeValue instanceof ECMAScriptSourceFunctionValue || typeValue instanceof AbstractObjectValue);
        let evaluatedChildRootNode = createReactEvaluatedNode("BAIL-OUT", getComponentName(this.realm, typeValue));
        evaluatedNode.children.push(evaluatedChildRootNode);
        this._queueNewComponentTree(typeValue, evaluatedChildRootNode);
        this._assignBailOutMessage(reactElement, `Bail-out: refs are not supported on <Components />`);
        return reactElement;
      }
      if (
        !(
          propsValue instanceof ObjectValue ||
          propsValue instanceof AbstractObjectValue ||
          propsValue instanceof AbstractValue
        )
      ) {
        this._assignBailOutMessage(
          reactElement,
          `Bail-out: props on <Component /> was not not an ObjectValue or an AbstractValue`
        );
        return reactElement;
      }
      let renderStrategy = this._getRenderStrategy(typeValue);

      if (
        renderStrategy === "NORMAL" &&
        !(typeValue instanceof ECMAScriptSourceFunctionValue || valueIsKnownReactAbstraction(this.realm, typeValue))
      ) {
        this._assignBailOutMessage(
          reactElement,
          `Bail-out: type on <Component /> was not a ECMAScriptSourceFunctionValue`
        );
        return reactElement;
      } else if (renderStrategy === "FRAGMENT") {
        return resolveChildren();
      }
      try {
        let result;
        switch (renderStrategy) {
          case "NORMAL": {
            invariant(typeValue instanceof ECMAScriptSourceFunctionValue || typeValue instanceof AbstractObjectValue);
            let evaluatedChildRootNode = createReactEvaluatedNode("INLINED", getComponentName(this.realm, typeValue));
            evaluatedNode.children.push(evaluatedChildRootNode);
            let render = this._renderComponent(
              typeValue,
              propsValue,
              context,
              branchStatus === "NEW_BRANCH" ? "BRANCH" : branchStatus,
              null,
              evaluatedChildRootNode
            );
            result = render.result;
            this.statistics.inlinedComponents++;
            break;
          }
          case "RELAY_QUERY_RENDERER": {
            invariant(typeValue instanceof AbstractObjectValue);
            let evaluatedChildRootNode = createReactEvaluatedNode(
              "RENDER_PROPS",
              getComponentName(this.realm, typeValue)
            );
            evaluatedNode.children.push(evaluatedChildRootNode);
            let render = this._renderRelayQueryRendererComponent(reactElement, propsValue, context);
            result = render.result;
            break;
          }
          default:
            invariant(false, "unsupported render strategy");
        }

        if (result instanceof UndefinedValue) {
          this._assignBailOutMessage(reactElement, `Bail-out: undefined was returned from render`);
          if (branchStatus === "NEW_BRANCH" && branchState) {
            return branchState.captureBranchedValue(typeValue, reactElement);
          }
          return reactElement;
        }
        if (branchStatus === "NEW_BRANCH" && branchState) {
          return branchState.captureBranchedValue(typeValue, result);
        }
        return result;
      } catch (error) {
        // assign a bail out message
        if (error instanceof NewComponentTreeBranch) {
          // NO-OP (we don't queue a newComponentTree as this was already done)
        } else {
          invariant(typeValue instanceof ECMAScriptSourceFunctionValue || typeValue instanceof AbstractObjectValue);
          let evaluatedChildRootNode = createReactEvaluatedNode("BAIL-OUT", getComponentName(this.realm, typeValue));
          evaluatedNode.children.push(evaluatedChildRootNode);
          this._queueNewComponentTree(typeValue, evaluatedChildRootNode);
          if (error instanceof ExpectedBailOut) {
            this._assignBailOutMessage(reactElement, "Bail-out: " + error.message);
          } else if (error instanceof FatalError) {
            this._assignBailOutMessage(reactElement, "Evaluation bail-out");
          } else {
            throw error;
          }
        }
        // a child component bailed out during component folding, so return the function value and continue
        if (branchStatus === "NEW_BRANCH" && branchState) {
          return branchState.captureBranchedValue(typeValue, reactElement);
        }
        return reactElement;
      }
    } else {
      throw new ExpectedBailOut("unsupported value type during reconcilation");
    }
  }

  _assignBailOutMessage(reactElement: ObjectValue, message: string): void {
    // $BailOutReason is a field on ObjectValue that allows us to specify a message
    // that gets serialized as a comment node during the ReactElement serialization stage
    if (reactElement.$BailOutReason !== undefined) {
      // merge bail out messages if one already exists
      reactElement.$BailOutReason += `, ${message}`;
    } else {
      reactElement.$BailOutReason = message;
    }
  }

  _resolveArray(
    arrayValue: ArrayValue,
    context: ObjectValue | AbstractObjectValue,
    branchStatus: BranchStatusEnum,
    branchState: BranchState | null,
    evaluatedNode: ReactEvaluatedNode
  ) {
    forEachArrayValue(this.realm, arrayValue, (elementValue, elementPropertyDescriptor) => {
      elementPropertyDescriptor.value = this._resolveDeeply(
        elementValue,
        context,
        branchStatus,
        branchState,
        evaluatedNode
      );
    });
  }
}
