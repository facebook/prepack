/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm, Effects } from "../realm.js";
import type { ConsoleMethodTypes, Descriptor, PropertyBinding, DisplayResult } from "../types.js";
import type { Binding } from "../environment.js";
import {
  AbstractObjectValue,
  AbstractValue,
  type AbstractValueKind,
  BooleanValue,
  ConcreteValue,
  EmptyValue,
  FunctionValue,
  NullValue,
  NumberValue,
  IntegralValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { CompilerDiagnostic } from "../errors.js";
import type { AbstractValueBuildNodeFunction } from "../values/AbstractValue.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import * as t from "@babel/types";
import invariant from "../invariant.js";
import {
  AbruptCompletion,
  ForkedAbruptCompletion,
  ThrowCompletion,
  ReturnCompletion,
  PossiblyNormalCompletion,
  SimpleNormalCompletion,
} from "../completions.js";
import type {
  BabelNodeExpression,
  BabelNodeIdentifier,
  BabelNodeThisExpression,
  BabelNodeStatement,
  BabelNodeMemberExpression,
  BabelNodeVariableDeclaration,
  BabelNodeBlockStatement,
  BabelNodeLVal,
} from "@babel/types";
import { nullExpression, memberExpressionHelper } from "./babelhelpers.js";
import { Utils, concretize } from "../singletons.js";
import type { SerializerOptions } from "../options.js";
import type { ShapeInformationInterface } from "../types.js";

export type SerializationContext = {|
  serializeValue: Value => BabelNodeExpression,
  serializeBinding: Binding => BabelNodeIdentifier | BabelNodeMemberExpression,
  getPropertyAssignmentStatement: (
    location: BabelNodeLVal,
    value: Value,
    mightHaveBeenDeleted: boolean,
    deleteIfMightHaveBeenDeleted: boolean
  ) => BabelNodeStatement,
  serializeGenerator: (Generator, Set<AbstractValue | ObjectValue>) => Array<BabelNodeStatement>,
  initGenerator: Generator => void,
  finalizeGenerator: Generator => void,
  emitDefinePropertyBody: (ObjectValue, string | SymbolValue, Descriptor) => BabelNodeStatement,
  emit: BabelNodeStatement => void,
  processValues: (Set<AbstractValue | ObjectValue>) => void,
  canOmit: Value => boolean,
  declare: (AbstractValue | ObjectValue) => void,
  emitPropertyModification: PropertyBinding => void,
  emitBindingModification: Binding => void,
  options: SerializerOptions,
|};

export type VisitEntryCallbacks = {|
  visitEquivalentValue: Value => Value,
  visitGenerator: (Generator, Generator) => void,
  canOmit: Value => boolean,
  recordDeclaration: (AbstractValue | ObjectValue) => void,
  recordDelayedEntry: (Generator, GeneratorEntry) => void,
  visitModifiedProperty: PropertyBinding => void,
  visitModifiedBinding: Binding => void,
  visitBindingAssignment: (Binding, Value) => Value,
|};

export type TemporalBuildNodeType = "OBJECT_ASSIGN";

export type DerivedExpressionBuildNodeFunction = (
  Array<BabelNodeExpression>,
  SerializationContext,
  Set<AbstractValue | ObjectValue>
) => BabelNodeExpression;

export type GeneratorBuildNodeFunction = (
  Array<BabelNodeExpression>,
  SerializationContext,
  Set<AbstractValue | ObjectValue>
) => BabelNodeStatement;

export class GeneratorEntry {
  constructor(realm: Realm) {
    // We increment the index of every TemporalBuildNodeEntry created.
    // This should match up as a form of timeline value due to the tree-like
    // structure we use to create entries during evaluation. For example,
    // if all AST nodes in a BlockStatement resulted in a temporal build node
    // for each AST node, then each would have a sequential index as to its
    // position of how it was evaluated in the BlockSstatement.
    this.index = realm.temporalEntryCounter++;
  }

  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  serialize(context: SerializationContext) {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  getDependencies(): void | Array<Generator> {
    invariant(false, "GeneratorEntry is an abstract base class");
  }

  notEqualToAndDoesNotHappenBefore(entry: GeneratorEntry): boolean {
    return this.index > entry.index;
  }

  notEqualToAndDoesNotHappenAfter(entry: GeneratorEntry): boolean {
    return this.index < entry.index;
  }

  index: number;
}

export type TemporalBuildNodeEntryArgs = {
  declared?: AbstractValue | ObjectValue,
  args: Array<Value>,
  // If we're just trying to add roots for the serializer to notice, we don't need a buildNode.
  buildNode?: GeneratorBuildNodeFunction,
  dependencies?: Array<Generator>,
  isPure?: boolean,
  mutatesOnly?: Array<Value>,
  temporalType?: TemporalBuildNodeType,
};

export class TemporalBuildNodeEntry extends GeneratorEntry {
  constructor(realm: Realm, args: TemporalBuildNodeEntryArgs) {
    super(realm);
    Object.assign(this, args);
    if (this.mutatesOnly !== undefined) {
      invariant(!this.isPure);
      for (let arg of this.mutatesOnly) {
        invariant(this.args.includes(arg));
      }
    }
  }

  declared: void | AbstractValue | ObjectValue;
  args: Array<Value>;
  // If we're just trying to add roots for the serializer to notice, we don't need a buildNode.
  buildNode: void | GeneratorBuildNodeFunction;
  dependencies: void | Array<Generator>;
  isPure: void | boolean;
  mutatesOnly: void | Array<Value>;
  temporalType: void | TemporalBuildNodeType;

  toDisplayJson(depth: number): DisplayResult {
    if (depth <= 0) return `TemporalBuildNode${this.index}`;
    let obj = { type: "TemporalBuildNode", ...this };
    delete obj.buildNode;
    return Utils.verboseToDisplayJson(obj, depth);
  }

  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    let omit = this.isPure && this.declared && callbacks.canOmit(this.declared);

    if (!omit && this.declared && this.mutatesOnly !== undefined) {
      omit = true;
      for (let arg of this.mutatesOnly) {
        if (!callbacks.canOmit(arg)) {
          omit = false;
        }
      }
    }
    if (omit) {
      callbacks.recordDelayedEntry(containingGenerator, this);
      return false;
    } else {
      if (this.declared) callbacks.recordDeclaration(this.declared);
      for (let i = 0, n = this.args.length; i < n; i++) this.args[i] = callbacks.visitEquivalentValue(this.args[i]);
      if (this.dependencies)
        for (let dependency of this.dependencies) callbacks.visitGenerator(dependency, containingGenerator);
      return true;
    }
  }

  serialize(context: SerializationContext): void {
    let omit = this.isPure && this.declared && context.canOmit(this.declared);

    if (!omit && this.declared && this.mutatesOnly !== undefined) {
      omit = true;
      for (let arg of this.mutatesOnly) {
        if (!context.canOmit(arg)) {
          omit = false;
        }
      }
    }
    if (!omit) {
      let nodes = this.args.map((boundArg, i) => context.serializeValue(boundArg));
      if (this.buildNode) {
        let valuesToProcess = new Set();
        let node = this.buildNode(nodes, context, valuesToProcess);
        if (node.type === "BlockStatement") {
          let block: BabelNodeBlockStatement = (node: any);
          let statements = block.body;
          if (statements.length === 0) return;
          if (statements.length === 1) {
            node = statements[0];
          }
        }
        let declared = this.declared;
        if (declared !== undefined && context.options.debugScopes) {
          let s = t.emptyStatement();
          s.leadingComments = [({ type: "BlockComment", value: `declaring ${declared.intrinsicName || "?"}` }: any)];
          context.emit(s);
        }
        context.emit(node);
        context.processValues(valuesToProcess);
      }
      if (this.declared !== undefined) context.declare(this.declared);
    }
  }

  getDependencies(): void | Array<Generator> {
    return this.dependencies;
  }
}

export class TemporalObjectAssignEntry extends TemporalBuildNodeEntry {
  visit(callbacks: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    let declared = this.declared;
    if (!(declared instanceof AbstractObjectValue || declared instanceof ObjectValue)) {
      return false;
    }
    let realm = declared.$Realm;
    // The only optimization we attempt to do to Object.assign for now is merging of multiple entries
    // into a new generator entry.
    let result = attemptToMergeEquivalentObjectAssigns(realm, callbacks, this);

    if (result instanceof TemporalObjectAssignEntry) {
      let nextResult = result;
      while (nextResult instanceof TemporalObjectAssignEntry) {
        nextResult = attemptToMergeEquivalentObjectAssigns(realm, callbacks, result);
        // If we get back a TemporalObjectAssignEntry, then we have successfully merged a single
        // Object.assign, but we may be able to merge more. So repeat the process.
        if (nextResult instanceof TemporalObjectAssignEntry) {
          result = nextResult;
        }
      }
      // We have an optimized temporal entry, so replace the current temporal
      // entry and visit that entry instead.
      this.args = result.args;
    } else if (result === "POSSIBLE_OPTIMIZATION") {
      callbacks.recordDelayedEntry(containingGenerator, this);
      return false;
    }
    return super.visit(callbacks, containingGenerator);
  }
}

type ModifiedPropertyEntryArgs = {|
  propertyBinding: PropertyBinding,
  newDescriptor: void | Descriptor,
  containingGenerator: Generator,
|};

class ModifiedPropertyEntry extends GeneratorEntry {
  constructor(realm: Realm, args: ModifiedPropertyEntryArgs) {
    super(realm);
    Object.assign(this, args);
  }

  containingGenerator: Generator;
  propertyBinding: PropertyBinding;
  newDescriptor: void | Descriptor;

  toDisplayString(): string {
    let propertyKey = this.propertyBinding.key;
    let propertyKeyString = propertyKey instanceof Value ? propertyKey.toDisplayString() : propertyKey;
    invariant(propertyKeyString !== undefined);
    return `[ModifiedProperty ${propertyKeyString}]`;
  }

  serialize(context: SerializationContext): void {
    let desc = this.propertyBinding.descriptor;
    invariant(desc === this.newDescriptor);
    context.emitPropertyModification(this.propertyBinding);
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    let desc = this.propertyBinding.descriptor;
    invariant(desc === this.newDescriptor);
    context.visitModifiedProperty(this.propertyBinding);
    return true;
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

type ModifiedBindingEntryArgs = {|
  modifiedBinding: Binding,
  containingGenerator: Generator,
|};

class ModifiedBindingEntry extends GeneratorEntry {
  constructor(realm: Realm, args: ModifiedBindingEntryArgs) {
    super(realm);
    Object.assign(this, args);
  }

  containingGenerator: Generator;
  modifiedBinding: Binding;

  toDisplayString(): string {
    return `[ModifiedBinding ${this.modifiedBinding.name}]`;
  }

  serialize(context: SerializationContext): void {
    context.emitBindingModification(this.modifiedBinding);
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    context.visitModifiedBinding(this.modifiedBinding);
    return true;
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

class ReturnValueEntry extends GeneratorEntry {
  constructor(realm: Realm, generator: Generator, returnValue: Value) {
    super(realm);
    this.returnValue = returnValue.promoteEmptyToUndefined();
    this.containingGenerator = generator;
  }

  returnValue: Value;
  containingGenerator: Generator;

  toDisplayString(): string {
    return `[Return ${this.returnValue.toDisplayString()}]`;
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    this.returnValue = context.visitEquivalentValue(this.returnValue);
    return true;
  }

  serialize(context: SerializationContext): void {
    let result = context.serializeValue(this.returnValue);
    context.emit(t.returnStatement(result));
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

class IfThenElseEntry extends GeneratorEntry {
  constructor(generator: Generator, completion: PossiblyNormalCompletion | ForkedAbruptCompletion, realm: Realm) {
    super(realm);
    this.completion = completion;
    this.containingGenerator = generator;
    this.condition = completion.joinCondition;

    this.consequentGenerator = Generator.fromEffects(completion.consequentEffects, realm, "ConsequentEffects");
    this.alternateGenerator = Generator.fromEffects(completion.alternateEffects, realm, "AlternateEffects");
  }

  completion: PossiblyNormalCompletion | ForkedAbruptCompletion;
  containingGenerator: Generator;

  condition: Value;
  consequentGenerator: Generator;
  alternateGenerator: Generator;

  toDisplayJson(depth: number): DisplayResult {
    if (depth <= 0) return `IfThenElseEntry${this.index}`;
    return Utils.verboseToDisplayJson(
      {
        type: "IfThenElse",
        condition: this.condition,
        consequent: this.consequentGenerator,
        alternate: this.alternateGenerator,
      },
      depth
    );
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    invariant(
      containingGenerator === this.containingGenerator,
      "This entry requires effects to be applied and may not be moved"
    );
    this.condition = context.visitEquivalentValue(this.condition);
    context.visitGenerator(this.consequentGenerator, containingGenerator);
    context.visitGenerator(this.alternateGenerator, containingGenerator);
    return true;
  }

  serialize(context: SerializationContext): void {
    let condition = context.serializeValue(this.condition);
    let valuesToProcess = new Set();
    let consequentBody = context.serializeGenerator(this.consequentGenerator, valuesToProcess);
    let alternateBody = context.serializeGenerator(this.alternateGenerator, valuesToProcess);
    context.emit(t.ifStatement(condition, t.blockStatement(consequentBody), t.blockStatement(alternateBody)));
    context.processValues(valuesToProcess);
  }

  getDependencies(): void | Array<Generator> {
    return [this.consequentGenerator, this.alternateGenerator];
  }
}

class BindingAssignmentEntry extends GeneratorEntry {
  constructor(realm: Realm, binding: Binding, value: Value) {
    super(realm);
    this.binding = binding;
    this.value = value;
  }

  binding: Binding;
  value: Value;

  toDisplayString(): string {
    return `[BindingAssignment ${this.binding.name} = ${this.value.toDisplayString()}]`;
  }

  serialize(context: SerializationContext): void {
    context.emit(
      t.expressionStatement(
        t.assignmentExpression("=", context.serializeBinding(this.binding), context.serializeValue(this.value))
      )
    );
  }

  visit(context: VisitEntryCallbacks, containingGenerator: Generator): boolean {
    this.value = context.visitBindingAssignment(this.binding, this.value);
    return true;
  }

  getDependencies(): void | Array<Generator> {
    return undefined;
  }
}

function serializeBody(
  generator: Generator,
  context: SerializationContext,
  valuesToProcess: Set<AbstractValue | ObjectValue>
): BabelNodeBlockStatement {
  let statements = context.serializeGenerator(generator, valuesToProcess);
  if (statements.length === 1 && statements[0].type === "BlockStatement") return (statements[0]: any);
  return t.blockStatement(statements);
}

export class Generator {
  constructor(realm: Realm, name: string, pathConditions: Array<AbstractValue>, effects?: Effects) {
    invariant(realm.useAbstractInterpretation);
    let realmPreludeGenerator = realm.preludeGenerator;
    invariant(realmPreludeGenerator);
    this.preludeGenerator = realmPreludeGenerator;
    this.realm = realm;
    this._entries = [];
    this.id = realm.nextGeneratorId++;
    this._name = name;
    this.effectsToApply = effects;
    this.pathConditions = pathConditions;
  }

  realm: Realm;
  _entries: Array<GeneratorEntry>;
  preludeGenerator: PreludeGenerator;
  effectsToApply: void | Effects;
  id: number;
  _name: string;
  pathConditions: Array<AbstractValue>;

  toDisplayString(): string {
    return Utils.jsonToDisplayString(this, 2);
  }

  toDisplayJson(depth: number): DisplayResult {
    if (depth <= 0) return `Generator${this.id}-${this._name}`;
    return Utils.verboseToDisplayJson(this, depth);
  }

  static _generatorOfEffects(
    realm: Realm,
    name: string,
    environmentRecordIdAfterGlobalCode: number,
    effects: Effects
  ): Generator {
    let { result, generator, modifiedBindings, modifiedProperties, createdObjects } = effects;

    let output = new Generator(realm, name, generator.pathConditions, effects);
    output.appendGenerator(generator, generator._name);

    for (let propertyBinding of modifiedProperties.keys()) {
      let object = propertyBinding.object;
      if (createdObjects.has(object)) continue; // Created Object's binding
      if (ObjectValue.refuseSerializationOnPropertyBinding(propertyBinding)) continue; // modification to internal state
      // modifications to intrinsic objects are tracked in the generator
      if (object.isIntrinsic()) continue;
      output.emitPropertyModification(propertyBinding);
    }

    for (let modifiedBinding of modifiedBindings.keys()) {
      // TODO: Instead of looking at the environment ids, keep instead track of a createdEnvironmentRecords set,
      // and only consider bindings here from environment records that already existed, or even better,
      // ensure upstream that only such bindings are ever added to the modified-bindings set.
      if (modifiedBinding.environment.id >= environmentRecordIdAfterGlobalCode) continue;

      output.emitBindingModification(modifiedBinding);
    }

    if (result instanceof UndefinedValue) return output;
    if (result instanceof SimpleNormalCompletion || result instanceof ReturnCompletion) {
      output.emitReturnValue(result.value);
    } else if (result instanceof PossiblyNormalCompletion || result instanceof ForkedAbruptCompletion) {
      output.emitIfThenElse(result, realm);
    } else if (result instanceof ThrowCompletion) {
      output.emitThrow(result.value);
    } else if (result instanceof AbruptCompletion) {
      // no-op
    } else {
      invariant(false);
    }
    return output;
  }

  // Make sure to to fixup
  // how to apply things around sets of things
  static fromEffects(
    effects: Effects,
    realm: Realm,
    name: string,
    environmentRecordIdAfterGlobalCode: number = 0
  ): Generator {
    return realm.withEffectsAppliedInGlobalEnv(
      this._generatorOfEffects.bind(this, realm, name, environmentRecordIdAfterGlobalCode),
      effects
    );
  }

  emitPropertyModification(propertyBinding: PropertyBinding): void {
    invariant(this.effectsToApply !== undefined);
    let desc = propertyBinding.descriptor;
    if (desc !== undefined) {
      let value = desc.value;
      if (value instanceof AbstractValue) {
        if (value.kind === "conditional") {
          let [c, x, y] = value.args;
          if (c instanceof AbstractValue && c.kind === "template for property name condition") {
            let ydesc = Object.assign({}, desc, { value: y });
            let yprop = Object.assign({}, propertyBinding, { descriptor: ydesc });
            this.emitPropertyModification(yprop);
            let xdesc = Object.assign({}, desc, { value: x });
            let key = c.args[0];
            invariant(key instanceof AbstractValue);
            let xprop = Object.assign({}, propertyBinding, { key, descriptor: xdesc });
            this.emitPropertyModification(xprop);
            return;
          }
        } else if (value.kind === "template for prototype member expression") {
          return;
        }
      }
    }
    this._entries.push(
      new ModifiedPropertyEntry(this.realm, {
        propertyBinding,
        newDescriptor: desc,
        containingGenerator: this,
      })
    );
  }

  emitBindingModification(modifiedBinding: Binding): void {
    invariant(this.effectsToApply !== undefined);
    this._entries.push(
      new ModifiedBindingEntry(this.realm, {
        modifiedBinding,
        containingGenerator: this,
      })
    );
  }

  emitReturnValue(result: Value): void {
    this._entries.push(new ReturnValueEntry(this.realm, this, result));
  }

  emitIfThenElse(result: PossiblyNormalCompletion | ForkedAbruptCompletion, realm: Realm): void {
    this._entries.push(new IfThenElseEntry(this, result, realm));
  }

  getName(): string {
    return `${this._name}(#${this.id})`;
  }

  empty(): boolean {
    return this._entries.length === 0;
  }

  emitGlobalDeclaration(key: string, value: Value): void {
    this.preludeGenerator.declaredGlobals.add(key);
    if (!(value instanceof UndefinedValue)) this.emitGlobalAssignment(key, value);
  }

  emitGlobalAssignment(key: string, value: Value): void {
    this._addEntry({
      args: [value],
      buildNode: ([valueNode]) =>
        t.expressionStatement(
          t.assignmentExpression("=", this.preludeGenerator.globalReference(key, false), valueNode)
        ),
    });
  }

  emitConcreteModel(key: string, value: Value): void {
    this._addEntry({
      args: [concretize(this.realm, value)],
      buildNode: ([valueNode]) =>
        t.expressionStatement(
          t.assignmentExpression("=", this.preludeGenerator.globalReference(key, false), valueNode)
        ),
    });
  }

  emitGlobalDelete(key: string): void {
    this._addEntry({
      args: [],
      buildNode: ([]) =>
        t.expressionStatement(t.unaryExpression("delete", this.preludeGenerator.globalReference(key, false))),
    });
  }

  emitBindingAssignment(binding: Binding, value: Value): void {
    this._entries.push(new BindingAssignmentEntry(this.realm, binding, value));
  }

  emitPropertyAssignment(object: ObjectValue, key: string, value: Value): void {
    if (object.refuseSerialization) return;
    this._addEntry({
      args: [object, value],
      buildNode: ([objectNode, valueNode], context) =>
        context.getPropertyAssignmentStatement(
          memberExpressionHelper(objectNode, key),
          value,
          value.mightHaveBeenDeleted(),
          /* deleteIfMightHaveBeenDeleted */ true
        ),
    });
  }

  emitDefineProperty(object: ObjectValue, key: string, desc: Descriptor, isDescChanged: boolean = true): void {
    if (object.refuseSerialization) return;
    if (desc.enumerable && desc.configurable && desc.writable && desc.value && !isDescChanged) {
      let descValue = desc.value;
      invariant(descValue instanceof Value);
      this.emitPropertyAssignment(object, key, descValue);
    } else {
      desc = Object.assign({}, desc);
      let descValue = desc.value || object.$Realm.intrinsics.undefined;
      invariant(descValue instanceof Value);
      this._addEntry({
        args: [
          object,
          descValue,
          desc.get || object.$Realm.intrinsics.undefined,
          desc.set || object.$Realm.intrinsics.undefined,
        ],
        buildNode: (_, context: SerializationContext) => context.emitDefinePropertyBody(object, key, desc),
      });
    }
  }

  emitPropertyDelete(object: ObjectValue, key: string): void {
    if (object.refuseSerialization) return;
    this._addEntry({
      args: [object],
      buildNode: ([objectNode]) =>
        t.expressionStatement(t.unaryExpression("delete", memberExpressionHelper(objectNode, key))),
    });
  }

  emitCall(createCallee: () => BabelNodeExpression, args: Array<Value>): void {
    this._addEntry({
      args,
      buildNode: values => t.expressionStatement(t.callExpression(createCallee(), [...values])),
    });
  }

  emitConsoleLog(method: ConsoleMethodTypes, args: Array<string | ConcreteValue>): void {
    this.emitCall(
      () => t.memberExpression(t.identifier("console"), t.identifier(method)),
      args.map(v => (typeof v === "string" ? new StringValue(this.realm, v) : v))
    );
  }

  // test must be a temporal value, which means that it must have a defined intrinsicName
  emitDoWhileStatement(test: AbstractValue, body: Generator): void {
    this._addEntry({
      args: [],
      buildNode: function([], context, valuesToProcess) {
        let testId = test.intrinsicName;
        invariant(testId !== undefined);
        let statements = context.serializeGenerator(body, valuesToProcess);
        let block = t.blockStatement(statements);
        return t.doWhileStatement(t.identifier(testId), block);
      },
      dependencies: [body],
    });
  }

  emitConditionalThrow(value: Value): void {
    function createStatement(val: Value, context: SerializationContext) {
      if (!(val instanceof AbstractValue) || val.kind !== "conditional") {
        return t.throwStatement(context.serializeValue(val));
      }
      let [cond, trueVal, falseVal] = val.args;
      let condVal = context.serializeValue(cond);
      let trueStat, falseStat;
      if (trueVal instanceof EmptyValue) trueStat = t.blockStatement([]);
      else trueStat = createStatement(trueVal, context);
      if (falseVal instanceof EmptyValue) falseStat = t.blockStatement([]);
      else falseStat = createStatement(falseVal, context);
      return t.ifStatement(condVal, trueStat, falseStat);
    }
    this._addEntry({
      args: [value],
      buildNode: function([argument], context: SerializationContext) {
        return createStatement(value, context);
      },
    });
  }

  _issueThrowCompilerDiagnostic(value: Value): void {
    let message = "Program may terminate with exception";
    if (value instanceof ObjectValue) {
      let object = ((value: any): ObjectValue);
      let objectMessage = this.realm.evaluateWithUndo(() => object._SafeGetDataPropertyValue("message"));
      if (objectMessage instanceof StringValue) message += `: ${objectMessage.value}`;
      const objectStack = this.realm.evaluateWithUndo(() => object._SafeGetDataPropertyValue("stack"));
      if (objectStack instanceof StringValue)
        message += `
  ${objectStack.value}`;
    }
    const diagnostic = new CompilerDiagnostic(message, value.expressionLocation, "PP0023", "Warning");
    this.realm.handleError(diagnostic);
  }

  emitThrow(value: Value): void {
    this._issueThrowCompilerDiagnostic(value);
    this.emitStatement([value], ([argument]) => t.throwStatement(argument));
  }

  // Checks the full set of possible concrete values as well as typeof
  // for any AbstractValues
  // e.g: (obj.property !== undefined && typeof obj.property !== "object")
  // NB: if the type of the AbstractValue is top, skips the invariant
  emitFullInvariant(object: ObjectValue | AbstractObjectValue, key: string, value: Value): void {
    if (object.refuseSerialization) return;
    let accessedPropertyOf = objectNode => memberExpressionHelper(objectNode, key);
    let condition;
    if (value instanceof AbstractValue) {
      let isTop = false;
      let concreteComparisons = [];
      let typeComparisons = new Set();

      function populateComparisonsLists(absValue: AbstractValue) {
        if (absValue.kind === "abstractConcreteUnion") {
          // recurse
          for (let nestedValue of absValue.args)
            if (nestedValue instanceof ConcreteValue) {
              concreteComparisons.push(nestedValue);
            } else {
              invariant(nestedValue instanceof AbstractValue);
              populateComparisonsLists(nestedValue);
            }
        } else if (absValue.getType() === Value) {
          isTop = true;
        } else {
          typeComparisons.add(absValue.getType());
        }
      }
      populateComparisonsLists(value);

      // No point in doing the invariant if we don't know the type
      // of one of the nested abstract values
      if (isTop) {
        return;
      } else {
        condition = ([valueNode]) => {
          // Create `object.property !== concreteValue`
          let checks = concreteComparisons.map(concreteValue =>
            t.binaryExpression("!==", valueNode, t.valueToNode(concreteValue.serialize()))
          );
          // Create `typeof object.property !== typeValue`
          checks = checks.concat(
            [...typeComparisons].map(typeValue => {
              let typeString = Utils.typeToString(typeValue);
              invariant(typeString !== undefined, typeValue);
              return t.binaryExpression(
                "!==",
                t.unaryExpression("typeof", valueNode, true),
                t.stringLiteral(typeString)
              );
            })
          );
          return checks.reduce((expr, newCondition) => t.logicalExpression("&&", expr, newCondition));
        };
        this._emitInvariant([value, value], condition, valueNode => valueNode);
      }
    } else if (value instanceof FunctionValue) {
      // We do a special case for functions,
      // as we like to use concrete functions in the model to model abstract behaviors.
      // These concrete functions do not have the right identity.
      condition = ([objectNode]) =>
        t.binaryExpression(
          "!==",
          t.unaryExpression("typeof", accessedPropertyOf(objectNode), true),
          t.stringLiteral("function")
        );
      this._emitInvariant([object, value, object], condition, objnode => accessedPropertyOf(objnode));
    } else {
      condition = ([objectNode, valueNode]) => t.binaryExpression("!==", accessedPropertyOf(objectNode), valueNode);
      this._emitInvariant([object, value, object], condition, objnode => accessedPropertyOf(objnode));
    }
  }

  getErrorStatement(message: BabelNodeExpression): BabelNodeStatement {
    if (this.realm.invariantMode === "throw")
      return t.throwStatement(t.newExpression(this.preludeGenerator.memoizeReference("Error"), [message]));
    else {
      let targetReference = this.realm.invariantMode;
      let args = [message];
      let i = targetReference.indexOf("+");
      if (i !== -1) {
        let s = targetReference.substr(i + 1);
        let x = Number.parseInt(s, 10);
        args.push(isNaN(x) ? t.stringLiteral(s) : t.numericLiteral(x));
        targetReference = targetReference.substr(0, i);
      }
      return t.expressionStatement(t.callExpression(this.preludeGenerator.memoizeReference(targetReference), args));
    }
  }

  emitPropertyInvariant(
    object: ObjectValue | AbstractObjectValue,
    key: string,
    state: "MISSING" | "PRESENT" | "DEFINED"
  ): void {
    if (object.refuseSerialization) return;
    let accessedPropertyOf = (objectNode: BabelNodeExpression) => memberExpressionHelper(objectNode, key);
    let condition = ([objectNode: BabelNodeExpression]) => {
      let n = t.callExpression(
        t.memberExpression(
          this.preludeGenerator.memoizeReference("Object.prototype.hasOwnProperty"),
          t.identifier("call")
        ),
        [objectNode, t.stringLiteral(key)]
      );
      if (state !== "MISSING") {
        n = t.unaryExpression("!", n, true);
        if (state === "DEFINED")
          n = t.logicalExpression(
            "||",
            n,
            t.binaryExpression("===", accessedPropertyOf(objectNode), t.valueToNode(undefined))
          );
      }
      return n;
    };

    this._emitInvariant([object, object], condition, objnode => accessedPropertyOf(objnode));
  }

  _emitInvariant(
    args: Array<Value>,
    violationConditionFn: (Array<BabelNodeExpression>) => BabelNodeExpression,
    appendLastToInvariantFn?: BabelNodeExpression => BabelNodeExpression
  ): void {
    invariant(this.realm.invariantLevel > 0);
    this._addEntry({
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) => {
        let messageComponents = [
          t.stringLiteral("Prepack model invariant violation ("),
          t.numericLiteral(this.preludeGenerator.nextInvariantId++),
        ];
        if (appendLastToInvariantFn) {
          let last = nodes.pop();
          messageComponents.push(t.stringLiteral("): "));
          messageComponents.push(appendLastToInvariantFn(last));
        } else messageComponents.push(t.stringLiteral(")"));
        let throwString = messageComponents[0];
        for (let i = 1; i < messageComponents.length; i++)
          throwString = t.binaryExpression("+", throwString, messageComponents[i]);
        let condition = violationConditionFn(nodes);
        let consequent = this.getErrorStatement(throwString);
        return t.ifStatement(condition, consequent);
      },
    });
  }

  emitCallAndCaptureResult(
    types: TypesDomain,
    values: ValuesDomain,
    createCallee: () => BabelNodeExpression,
    args: Array<Value>,
    kind?: AbstractValueKind
  ): AbstractValue {
    return this.deriveAbstract(types, values, args, (nodes: any) => t.callExpression(createCallee(), nodes), { kind });
  }

  emitStatement(args: Array<Value>, buildNode_: (Array<BabelNodeExpression>) => BabelNodeStatement): void {
    this._addEntry({
      args,
      buildNode: buildNode_,
    });
  }

  emitVoidExpression(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode_: AbstractValueBuildNodeFunction | BabelNodeExpression
  ): UndefinedValue {
    this._addEntry({
      args,
      buildNode: (nodes: Array<BabelNodeExpression>) =>
        t.expressionStatement(
          (buildNode_: any) instanceof Function
            ? ((buildNode_: any): AbstractValueBuildNodeFunction)(nodes)
            : ((buildNode_: any): BabelNodeExpression)
        ),
    });
    return this.realm.intrinsics.undefined;
  }

  emitForInStatement(
    o: ObjectValue | AbstractObjectValue,
    lh: BabelNodeVariableDeclaration,
    sourceObject: ObjectValue,
    targetObject: ObjectValue,
    boundName: BabelNodeIdentifier
  ): void {
    this._addEntry({
      // duplicate args to ensure refcount > 1
      args: [o, targetObject, sourceObject, targetObject, sourceObject],
      buildNode: ([obj, tgt, src, obj1, tgt1, src1]) => {
        return t.forInStatement(
          lh,
          obj,
          t.blockStatement([
            t.expressionStatement(
              t.assignmentExpression(
                "=",
                memberExpressionHelper(tgt, boundName),
                memberExpressionHelper(src, boundName)
              )
            ),
          ])
        );
      },
    });
  }

  deriveConcreteObject(
    buildValue: (intrinsicName: string) => ObjectValue,
    args: Array<Value>,
    buildNode_: DerivedExpressionBuildNodeFunction | BabelNodeExpression,
    optionalArgs?: {| isPure?: boolean |}
  ): ConcreteValue {
    invariant(buildNode_ instanceof Function || args.length === 0);
    let id = t.identifier(this.preludeGenerator.nameGenerator.generate("derived"));
    let value = buildValue(id.name);
    value.intrinsicNameGenerated = true;
    value._isScopedTemplate = true; // because this object doesn't exist ahead of time, and the visitor would otherwise declare it in the common scope
    this._addDerivedEntry(id.name, {
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: value,
      args,
      buildNode: (nodes: Array<BabelNodeExpression>, context: SerializationContext, valuesToProcess) => {
        return t.variableDeclaration("var", [
          t.variableDeclarator(
            id,
            (buildNode_: any) instanceof Function
              ? ((buildNode_: any): DerivedExpressionBuildNodeFunction)(nodes, context, valuesToProcess)
              : ((buildNode_: any): BabelNodeExpression)
          ),
        ]);
      },
    });
    return value;
  }

  deriveAbstract(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode_: DerivedExpressionBuildNodeFunction | BabelNodeExpression,
    optionalArgs?: {|
      kind?: AbstractValueKind,
      isPure?: boolean,
      skipInvariant?: boolean,
      mutatesOnly?: Array<Value>,
      temporalType?: TemporalBuildNodeType,
      shape?: void | ShapeInformationInterface,
    |}
  ): AbstractValue {
    invariant(buildNode_ instanceof Function || args.length === 0);
    let id = t.identifier(this.preludeGenerator.nameGenerator.generate("derived"));
    let options = {};
    if (optionalArgs && optionalArgs.kind !== undefined) options.kind = optionalArgs.kind;
    if (optionalArgs && optionalArgs.shape !== undefined) options.shape = optionalArgs.shape;
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    let res = new Constructor(
      this.realm,
      types,
      values,
      1735003607742176 + this.realm.derivedIds.size,
      [],
      id,
      options
    );
    this._addDerivedEntry(id.name, {
      isPure: optionalArgs ? optionalArgs.isPure : undefined,
      declared: res,
      args,
      buildNode: (nodes: Array<BabelNodeExpression>, context: SerializationContext, valuesToProcess) => {
        return t.variableDeclaration("var", [
          t.variableDeclarator(
            id,
            (buildNode_: any) instanceof Function
              ? ((buildNode_: any): DerivedExpressionBuildNodeFunction)(nodes, context, valuesToProcess)
              : ((buildNode_: any): BabelNodeExpression)
          ),
        ]);
      },
      mutatesOnly: optionalArgs ? optionalArgs.mutatesOnly : undefined,
      temporalType: optionalArgs ? optionalArgs.temporalType : undefined,
    });
    let type = types.getType();
    res.intrinsicName = id.name;
    if (optionalArgs && optionalArgs.skipInvariant) return res;
    let typeofString;
    if (type instanceof FunctionValue) typeofString = "function";
    else if (type === UndefinedValue) invariant(false);
    else if (type === NullValue) invariant(false);
    else if (type === StringValue) typeofString = "string";
    else if (type === BooleanValue) typeofString = "boolean";
    else if (type === NumberValue) typeofString = "number";
    else if (type === IntegralValue) typeofString = "number";
    else if (type === SymbolValue) typeofString = "symbol";
    else if (type === ObjectValue) typeofString = "object";
    if (typeofString !== undefined && this.realm.invariantLevel >= 1) {
      // Verify that the types are as expected, a failure of this invariant
      // should mean the model is wrong.
      this._emitInvariant(
        [res, res],
        nodes => {
          invariant(typeofString !== undefined);
          let condition = t.binaryExpression(
            "!==",
            t.unaryExpression("typeof", nodes[0]),
            t.stringLiteral(typeofString)
          );
          if (typeofString === "object") {
            condition = t.logicalExpression(
              "&&",
              condition,
              t.binaryExpression("!==", t.unaryExpression("typeof", nodes[0]), t.stringLiteral("function"))
            );
            condition = t.logicalExpression("||", condition, t.binaryExpression("===", nodes[0], nullExpression));
          }
          return condition;
        },
        node => node
      );
    }

    return res;
  }

  visit(callbacks: VisitEntryCallbacks): void {
    let visitFn = () => {
      for (let entry of this._entries) entry.visit(callbacks, this);
      return null;
    };
    if (this.effectsToApply) {
      this.realm.withEffectsAppliedInGlobalEnv(visitFn, this.effectsToApply);
    } else {
      visitFn();
    }
  }

  serialize(context: SerializationContext): void {
    let serializeFn = () => {
      context.initGenerator(this);
      for (let entry of this._entries) entry.serialize(context);
      context.finalizeGenerator(this);
      return null;
    };
    if (this.effectsToApply) {
      this.realm.withEffectsAppliedInGlobalEnv(serializeFn, this.effectsToApply);
    } else {
      serializeFn();
    }
  }

  getDependencies(): Array<Generator> {
    let res = [];
    for (let entry of this._entries) {
      let dependencies = entry.getDependencies();
      if (dependencies !== undefined) res.push(...dependencies);
    }
    return res;
  }

  _addEntry(entryArgs: TemporalBuildNodeEntryArgs): TemporalBuildNodeEntry {
    let entry;
    if (entryArgs.temporalType === "OBJECT_ASSIGN") {
      entry = new TemporalObjectAssignEntry(this.realm, entryArgs);
    } else {
      entry = new TemporalBuildNodeEntry(this.realm, entryArgs);
    }
    this.realm.saveTemporalGeneratorEntryArgs(entry);
    this._entries.push(entry);
    return entry;
  }

  _addDerivedEntry(id: string, entryArgs: TemporalBuildNodeEntryArgs): void {
    let entry = this._addEntry(entryArgs);
    this.realm.derivedIds.set(id, entry);
  }

  appendGenerator(other: Generator, leadingComment: string): void {
    invariant(other !== this);
    invariant(other.realm === this.realm);
    invariant(other.preludeGenerator === this.preludeGenerator);

    if (other.empty()) return;
    if (other.effectsToApply === undefined) {
      this._entries.push(...other._entries);
    } else {
      this._addEntry({
        args: [],
        buildNode: function(args, context, valuesToProcess) {
          let statements = context.serializeGenerator(other, valuesToProcess);
          if (statements.length === 1) {
            let statement = statements[0];
            if (leadingComment.length > 0)
              statement.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
            return statement;
          }
          let block = t.blockStatement(statements);
          if (leadingComment.length > 0)
            block.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
          return block;
        },
        dependencies: [other],
      });
    }
  }

  joinGenerators(joinCondition: AbstractValue, generator1: Generator, generator2: Generator): void {
    invariant(generator1 !== this && generator2 !== this && generator1 !== generator2);
    if (generator1.empty() && generator2.empty()) return;
    this._addEntry({
      args: [joinCondition],
      buildNode: function([cond], context, valuesToProcess) {
        let block1 = generator1.empty() ? null : serializeBody(generator1, context, valuesToProcess);
        let block2 = generator2.empty() ? null : serializeBody(generator2, context, valuesToProcess);
        if (block1) return t.ifStatement(cond, block1, block2);
        invariant(block2);
        return t.ifStatement(t.unaryExpression("!", cond), block2);
      },
      dependencies: [generator1, generator2],
    });
  }
}

function escapeInvalidIdentifierCharacters(s: string): string {
  let res = "";
  for (let c of s)
    if ((c >= "0" && c <= "9") || (c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) res += c;
    else res += "_" + c.charCodeAt(0);
  return res;
}

const base62characters = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
function base62encode(n: number): string {
  invariant((n | 0) === n && n >= 0);
  if (n === 0) return "0";
  let s = "";
  while (n > 0) {
    let f = n % base62characters.length;
    s = base62characters[f] + s;
    n = (n - f) / base62characters.length;
  }
  return s;
}

export class NameGenerator {
  constructor(forbiddenNames: Set<string>, debugNames: boolean, uniqueSuffix: string, prefix: string) {
    this.prefix = prefix;
    this.uidCounter = 0;
    this.debugNames = debugNames;
    this.forbiddenNames = forbiddenNames;
    this.uniqueSuffix = uniqueSuffix;
  }
  prefix: string;
  uidCounter: number;
  debugNames: boolean;
  forbiddenNames: Set<string>;
  uniqueSuffix: string;
  generate(debugSuffix: ?string): string {
    let id;
    do {
      id = this.prefix + base62encode(this.uidCounter++);
      if (this.uniqueSuffix.length > 0) id += this.uniqueSuffix;
      if (this.debugNames) {
        if (debugSuffix) id += "_" + escapeInvalidIdentifierCharacters(debugSuffix);
        else id += "_";
      }
    } while (this.forbiddenNames.has(id));
    return id;
  }
}

export class PreludeGenerator {
  constructor(debugNames: ?boolean, uniqueSuffix: ?string) {
    this.prelude = [];
    this.memoizedRefs = new Map();
    this.nameGenerator = new NameGenerator(new Set(), !!debugNames, uniqueSuffix || "", "_$");
    this.usesThis = false;
    this.declaredGlobals = new Set();
    this.nextInvariantId = 0;
  }

  prelude: Array<BabelNodeStatement>;
  memoizedRefs: Map<string, BabelNodeIdentifier>;
  nameGenerator: NameGenerator;
  usesThis: boolean;
  declaredGlobals: Set<string>;
  nextInvariantId: number;

  createNameGenerator(prefix: string): NameGenerator {
    return new NameGenerator(
      this.nameGenerator.forbiddenNames,
      this.nameGenerator.debugNames,
      this.nameGenerator.uniqueSuffix,
      prefix
    );
  }

  convertStringToMember(str: string): BabelNodeIdentifier | BabelNodeThisExpression | BabelNodeMemberExpression {
    return str
      .split(".")
      .map(name => {
        if (name === "global") {
          return this.memoizeReference(name);
        } else if (name === "this") {
          return t.thisExpression();
        } else {
          return t.identifier(name);
        }
      })
      .reduce((obj, prop) => t.memberExpression(obj, prop));
  }

  globalReference(key: string, globalScope: boolean = false): BabelNodeIdentifier | BabelNodeMemberExpression {
    if (globalScope && t.isValidIdentifier(key)) return t.identifier(key);
    return memberExpressionHelper(this.memoizeReference("global"), key);
  }

  memoizeReference(key: string): BabelNodeIdentifier {
    let ref = this.memoizedRefs.get(key);
    if (ref) return ref;

    let init;
    if (key.includes("(") || key.includes("[")) {
      // Horrible but effective hack:
      // Some internal object have intrinsic names such as
      //    ([][Symbol.iterator]().__proto__.__proto__)
      // and
      //    RegExp.prototype[Symbol.match]
      // which get turned into a babel node here.
      // TODO: We should properly parse such a string, and memoize all references in it separately.
      // Instead, we just turn it into a funky identifier, which Babel seems to accept.
      init = t.identifier(key);
    } else if (key === "global") {
      this.usesThis = true;
      init = t.thisExpression();
    } else {
      let i = key.lastIndexOf(".");
      if (i === -1) {
        init = t.memberExpression(this.memoizeReference("global"), t.identifier(key));
      } else {
        init = t.memberExpression(this.memoizeReference(key.substr(0, i)), t.identifier(key.substr(i + 1)));
      }
    }
    ref = t.identifier(this.nameGenerator.generate(key));
    this.prelude.push(t.variableDeclaration("var", [t.variableDeclarator(ref, init)]));
    this.memoizedRefs.set(key, ref);
    return ref;
  }
}

type TemporalBuildNodeEntryOptimizationStatus = "NO_OPTIMIZATION" | "POSSIBLE_OPTIMIZATION";

// This function attempts to optimize Object.assign calls, by merging mulitple
// calls into one another where possible. For example:
//
// var a = Object.assign({}, someAbstact);
// var b = Object.assign({}, a);
//
// Becomes:
// var b = Object.assign({}, someAbstract, a);
//
export function attemptToMergeEquivalentObjectAssigns(
  realm: Realm,
  callbacks: VisitEntryCallbacks,
  temporalBuildNodeEntry: TemporalBuildNodeEntry
): TemporalBuildNodeEntryOptimizationStatus | TemporalObjectAssignEntry {
  let args = temporalBuildNodeEntry.args;
  // If we are Object.assigning 2 or more args
  if (args.length < 2) {
    return "NO_OPTIMIZATION";
  }
  let to = args[0];
  // Then scan through the args after the "to" of this Object.assign, to see if any
  // other sources are the "to" of a previous Object.assign call
  loopThroughArgs: for (let i = 1; i < args.length; i++) {
    let possibleOtherObjectAssignTo = args[i];
    // Ensure that the "to" value can be omitted
    // Note: this check is still somewhat fragile and depends on the visiting order
    // but it's not a functional problem right now and can be better addressed at a
    // later point.
    if (!callbacks.canOmit(possibleOtherObjectAssignTo)) {
      continue;
    }
    // Check if the "to" was definitely an Object.assign, it should
    // be a snapshot AbstractObjectValue
    if (possibleOtherObjectAssignTo instanceof AbstractObjectValue) {
      let otherTemporalBuildNodeEntry = realm.getTemporalBuildNodeEntryFromDerivedValue(possibleOtherObjectAssignTo);
      if (!(otherTemporalBuildNodeEntry instanceof TemporalObjectAssignEntry)) {
        continue;
      }
      let otherArgs = otherTemporalBuildNodeEntry.args;
      // Object.assign has at least 1 arg
      if (otherArgs.length < 1) {
        continue;
      }
      let otherArgsToUse = [];
      for (let x = 1; x < otherArgs.length; x++) {
        let arg = otherArgs[x];
        // The arg might have been havoced, so ensure we do not continue in this case
        if (arg instanceof ObjectValue && arg.mightBeHavocedObject()) {
          continue loopThroughArgs;
        }
        if (arg instanceof ObjectValue || arg instanceof AbstractValue) {
          let temporalGeneratorEntries = realm.getTemporalGeneratorEntriesReferencingArg(arg);
          // We need to now check if there are any other temporal entries that exist
          // between the Object.assign TemporalObjectAssignEntry that we're trying to
          // merge and the current TemporalObjectAssignEntry we're going to merge into.
          if (temporalGeneratorEntries !== undefined) {
            for (let temporalGeneratorEntry of temporalGeneratorEntries) {
              // If the entry is that of another Object.assign, then
              // we know that this entry isn't going to cause issues
              // with merging the TemporalObjectAssignEntry.
              if (temporalGeneratorEntry instanceof TemporalObjectAssignEntry) {
                continue;
              }
              // TODO: what if the temporalGeneratorEntry can be omitted and not needed?

              // If the index of this entry exists between start and end indexes,
              // then we cannot optimize and merge the TemporalObjectAssignEntry
              // because another generator entry may have a dependency on the Object.assign
              // TemporalObjectAssignEntry we're trying to merge.
              if (
                temporalGeneratorEntry.notEqualToAndDoesNotHappenBefore(otherTemporalBuildNodeEntry) &&
                temporalGeneratorEntry.notEqualToAndDoesNotHappenAfter(temporalBuildNodeEntry)
              ) {
                continue loopThroughArgs;
              }
            }
          }
        }
        otherArgsToUse.push(arg);
      }
      // If we cannot omit the "to" value that means it's being used, so we shall not try to
      // optimize this Object.assign.
      if (!callbacks.canOmit(to)) {
        // our merged Object.assign, shoud look like:
        // Object.assign(to, ...prefixArgs, ...otherArgsToUse, ...suffixArgs)
        let prefixArgs = args.slice(1, i - 1); // We start at 1, as 0 is the index of "to" a
        let suffixArgs = args.slice(i + 1);
        let newArgs = [to, ...prefixArgs, ...otherArgsToUse, ...suffixArgs];

        // We now create a new TemporalObjectAssignEntry, without mutating the existing
        // entry at this point. This new entry is essentially a TemporalObjectAssignEntry
        // that contains two Object.assign call TemporalObjectAssignEntry entries that have
        // been merged into a single entry. The previous Object.assign TemporalObjectAssignEntry
        // should dead-code eliminate away once we replace the original TemporalObjectAssignEntry
        // we started with with the new merged on as they will no longer be referenced.
        let newTemporalObjectAssignEntryArgs = Object.assign({}, temporalBuildNodeEntry, {
          args: newArgs,
        });
        return new TemporalObjectAssignEntry(realm, newTemporalObjectAssignEntryArgs);
      }
      // We might be able to optimize, but we are not sure because "to" can still omit.
      // So we return possible optimization status and wait until "to" does get visited.
      // It may never get visited, but that's okay as we'll skip the optimization all
      // together.
      return "POSSIBLE_OPTIMIZATION";
    }
  }
  return "NO_OPTIMIZATION";
}
