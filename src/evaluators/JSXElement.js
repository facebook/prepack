/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import type {
  BabelNode,
  BabelNodeStringLiteral,
  BabelNodeJSXText,
  BabelNodeJSXElement,
  BabelNodeJSXIdentifier,
  BabelNodeJSXMemberExpression,
  BabelNodeJSXAttribute,
  BabelNodeJSXSpreadAttribute,
  BabelNodeJSXExpressionContainer,
} from "babel-types";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import {
  AbstractObjectValue,
  ArrayValue,
  StringValue,
  Value,
  NumberValue,
  ObjectValue,
  FunctionValue,
  AbstractValue,
} from "../values/index.js";
import { convertJSXExpressionToIdentifier } from "../react/jsx.js";
import * as t from "babel-types";
import { Get } from "../methods/index.js";
import { Create, Environment, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import { createReactElement } from "../react/elements.js";

// taken from Babel
function cleanJSXElementLiteralChild(child: string): null | string {
  let lines = child.split(/\r\n|\n|\r/);

  let lastNonEmptyLine = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/[^ \t]/)) {
      lastNonEmptyLine = i;
    }
  }

  let str = "";

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    let isFirstLine = i === 0;
    let isLastLine = i === lines.length - 1;
    let isLastNonEmptyLine = i === lastNonEmptyLine;

    // replace rendered whitespace tabs with spaces
    let trimmedLine = line.replace(/\t/g, " ");

    // trim whitespace touching a newline
    if (!isFirstLine) {
      trimmedLine = trimmedLine.replace(/^[ ]+/, "");
    }

    // trim whitespace touching an endline
    if (!isLastLine) {
      trimmedLine = trimmedLine.replace(/[ ]+$/, "");
    }

    if (trimmedLine) {
      if (!isLastNonEmptyLine) {
        trimmedLine += " ";
      }

      str += trimmedLine;
    }
  }

  if (str) {
    return str;
  }
  return null;
}

function evaluateJSXMemberExpression(
  ast: BabelNode,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  switch (ast.type) {
    case "JSXIdentifier":
      return Environment.GetValue(
        realm,
        Environment.ResolveBinding(realm, ((ast: any): BabelNodeJSXIdentifier).name, strictCode, env)
      );
    case "JSXMemberExpression":
      return Environment.GetValue(
        realm,
        env.evaluate(convertJSXExpressionToIdentifier(((ast: any): BabelNodeJSXMemberExpression)), strictCode)
      );
    default:
      invariant(false, "Unknown JSX Identifier");
  }
}

function evaluateJSXIdentifier(ast, strictCode, env, realm): Value {
  if (isTagName(ast)) {
    // special cased lower-case and custom elements
    return new StringValue(realm, ((ast: any): BabelNodeJSXIdentifier).name);
  }
  return evaluateJSXMemberExpression(ast, strictCode, env, realm);
}

function evaluateJSXValue(value: BabelNode, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  if (value != null) {
    switch (value.type) {
      case "JSXText":
        return new StringValue(realm, ((value: any): BabelNodeJSXText).value);
      case "StringLiteral":
        return new StringValue(realm, ((value: any): BabelNodeStringLiteral).value);
      case "JSXExpressionContainer":
        return Environment.GetValue(
          realm,
          env.evaluate(((value: any): BabelNodeJSXExpressionContainer).expression, strictCode)
        );
      case "JSXElement":
        return Environment.GetValue(realm, env.evaluate(value, strictCode));
      default:
        invariant(false, `Unknown JSX value type: ${value.type}`);
    }
  }
  invariant(false, `Null or undefined value passed when trying to evaluate JSX node value`);
}

function isTagName(ast: BabelNode): boolean {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

function evaluateJSXChildren(
  children: Array<BabelNode>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ArrayValue | Value {
  if (children.length === 0) {
    return realm.intrinsics.undefined;
  }
  if (children.length === 1) {
    let singleChild = evaluateJSXValue(children[0], strictCode, env, realm);

    if (singleChild instanceof StringValue) {
      let text = cleanJSXElementLiteralChild(singleChild.value);
      if (text !== null) {
        singleChild.value = text;
      }
    }
    return singleChild;
  }
  let array = Create.ArrayCreate(realm, 0);
  let dynamicChildrenLength = children.length;
  let dynamicIterator = 0;
  let lastChildValue = realm.intrinsics.undefined;
  for (let i = 0; i < children.length; i++) {
    let value = evaluateJSXValue(children[i], strictCode, env, realm);
    if (value instanceof StringValue) {
      let text = cleanJSXElementLiteralChild(value.value);
      if (text === null) {
        dynamicChildrenLength--;
        // this is a space full of whitespace, so let's proceed
        continue;
      } else {
        value.value = text;
      }
    }
    lastChildValue = value;
    Create.CreateDataPropertyOrThrow(realm, array, "" + dynamicIterator, value);
    dynamicIterator++;
  }
  if (dynamicChildrenLength === 1) {
    return lastChildValue;
  }

  Properties.Set(realm, array, "length", new NumberValue(realm, dynamicChildrenLength), false);
  return array;
}

function evaluateJSXAttributes(
  astAttributes: Array<BabelNodeJSXAttribute | BabelNodeJSXSpreadAttribute>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ObjectValue | AbstractObjectValue {
  let config = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  let abstractPropsArgs = [];
  let containsAbstractSpreadAttribute = false;
  let spreadAttributesCount = 0;
  let spreadAttributesWithInitialPropsHintCount = 0;
  let attributesAssigned = 0;
  let spreadValue;

  const setConfigProperty = (name: string, value: Value): void => {
    invariant(config instanceof ObjectValue);
    Properties.Set(realm, config, name, value, true);
    attributesAssigned++;
  };

  for (let astAttribute of astAttributes) {
    switch (astAttribute.type) {
      case "JSXAttribute":
        let { name, value } = astAttribute;

        invariant(name.type === "JSXIdentifier", `JSX attribute name type not supported: ${astAttribute.type}`);
        setConfigProperty(name.name, evaluateJSXValue(((value: any): BabelNodeJSXIdentifier), strictCode, env, realm));
        break;
      case "JSXSpreadAttribute":
        spreadValue = Environment.GetValue(realm, env.evaluate(astAttribute.argument, strictCode));

        if (spreadValue instanceof ObjectValue) {
          for (let [spreadPropKey] of spreadValue.properties) {
            setConfigProperty(spreadPropKey, Get(realm, spreadValue, spreadPropKey));
          }
        } else {
          spreadAttributesCount++;
          containsAbstractSpreadAttribute = true;
          // check to see if this object has an abstractHint
          invariant(spreadValue instanceof AbstractValue);
          let reactHint = realm.react.abstractHints.get(spreadValue);

          if (reactHint === "HAS_NO_KEY_OR_REF") {
            spreadAttributesWithInitialPropsHintCount++;
          }
          // we push the props up to this point into the abstract props args. we also
          // push the abstract spread object and then we create a fresh props object
          if (config.properties.size > 0) {
            abstractPropsArgs.push(config);
          }
          abstractPropsArgs.push(spreadValue);
          config = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
        }
        break;
      default:
        invariant(false, `Unknown JSX attribute type: ${astAttribute.type}`);
    }
  }

  if (containsAbstractSpreadAttribute) {
    // if we haven't assigned any attributes and we are dealing with a single
    // spread attribute, we can just make the spread object the props
    if (attributesAssigned === 0) {
      config = spreadValue;
    } else if (attributesAssigned !== 0) {
      // we create an abstract Object.assign() to deal with the fact that we don't what
      // the props are because they contain abstract spread attributes that we can't
      // evaluate ahead of time
      let types = new TypesDomain(FunctionValue);
      let values = new ValuesDomain();
      let emptyObject = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
      // push the current config
      if (config.properties.size > 0) {
        abstractPropsArgs.push(config);
      }
      // get the global Object.assign
      let globalObj = Get(realm, realm.$GlobalObject, "Object");
      invariant(globalObj instanceof ObjectValue);
      let objAssign = Get(realm, globalObj, "assign");
      invariant(realm.generator);

      invariant(realm.generator);
      config = realm.generator.derive(
        types,
        values,
        [objAssign, emptyObject, ...abstractPropsArgs],
        ([methodNode, ..._args]) => {
          return t.callExpression(methodNode, ((_args: any): Array<any>));
        }
      );
      if (
        spreadAttributesCount === spreadAttributesWithInitialPropsHintCount &&
        spreadAttributesWithInitialPropsHintCount > 0
      ) {
        realm.react.abstractHints.set(config, "HAS_NO_KEY_OR_REF");
      }
    }
  }
  invariant(config instanceof ObjectValue || config instanceof AbstractObjectValue);
  return config;
}

export default function(
  ast: BabelNodeJSXElement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ObjectValue {
  invariant(realm.react.enabled, "JSXElements can only be evaluated with the reactEnabled option");
  let openingElement = ast.openingElement;
  let type = evaluateJSXIdentifier(openingElement.name, strictCode, env, realm);
  let children = evaluateJSXChildren(ast.children, strictCode, env, realm);
  let config = evaluateJSXAttributes(openingElement.attributes, strictCode, env, realm);
  invariant(type instanceof Value);
  return createReactElement(realm, type, config, children);
}
