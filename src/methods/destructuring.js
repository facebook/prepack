/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../invariant.js";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { Reference } from "../environment.js";
import type { PropertyKeyValue } from "../types.js";
import { Value, ObjectValue, UndefinedValue } from "../values/index.js";
import { NormalCompletion, AbruptCompletion } from "../completions.js";
import { EvalPropertyName } from "../evaluators/ObjectExpression.js";
import {
  RequireObjectCoercible,
  GetIterator,
  IteratorClose,
  IteratorStep,
  IteratorValue,
  IsAnonymousFunctionDefinition,
  IsIdentifierRef,
  HasOwnProperty,
  GetV,
} from "./index.js";
import { Create, Environment, Functions, Properties } from "../singletons.js";
import type { BabelNodeLVal, BabelNodeArrayPattern, BabelNodeObjectPattern } from "babel-types";

// ECMA262 12.15.5.2
export function DestructuringAssignmentEvaluation(
  realm: Realm,
  pattern: BabelNodeArrayPattern | BabelNodeObjectPattern,
  value: Value,
  strictCode: boolean,
  env: LexicalEnvironment
) {
  if (pattern.type === "ObjectPattern") {
    // 1. Perform ? RequireObjectCoercible(value).
    RequireObjectCoercible(realm, value);

    // 2. Return the result of performing DestructuringAssignmentEvaluation for AssignmentPropertyList using value as the argument.

    for (let property of pattern.properties) {
      // 1. Let name be the result of evaluating PropertyName.
      let name = EvalPropertyName(property, env, realm, strictCode);

      // 2. ReturnIfAbrupt(name).

      // 3. Return the result of performing KeyedDestructuringAssignmentEvaluation of AssignmentElement with value and name as the arguments.
      KeyedDestructuringAssignmentEvaluation(realm, property.value, value, name, strictCode, env);
    }
  } else if (pattern.type === "ArrayPattern") {
    // 1. Let iterator be ? GetIterator(value).
    let iterator = GetIterator(realm, value);

    // 2. Let iteratorRecord be Record {[[Iterator]]: iterator, [[Done]]: false}.
    let iteratorRecord = {
      $Iterator: iterator,
      $Done: false,
    };

    // 3. Let result be the result of performing IteratorDestructuringAssignmentEvaluation of AssignmentElementList using iteratorRecord as the argument.
    let result;
    try {
      result = IteratorDestructuringAssignmentEvaluation(realm, pattern.elements, iteratorRecord, strictCode, env);
    } catch (error) {
      // 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iterator, result).
      if (iteratorRecord.$Done === false && error instanceof AbruptCompletion) {
        throw IteratorClose(realm, iterator, error);
      }
      throw error;
    }

    // 4. If iteratorRecord.[[Done]] is false, return ? IteratorClose(iterator, result).
    if (iteratorRecord.$Done === false) {
      let completion = IteratorClose(realm, iterator, new NormalCompletion(realm.intrinsics.undefined));
      if (completion instanceof AbruptCompletion) {
        throw completion;
      }
    }

    // 5. Return result.
    return result;
  }
}

// ECMA262 12.15.5.3
export function IteratorDestructuringAssignmentEvaluation(
  realm: Realm,
  elements: $ReadOnlyArray<BabelNodeLVal | null>,
  iteratorRecord: { $Iterator: ObjectValue, $Done: boolean },
  strictCode: boolean,
  env: LexicalEnvironment
) {
  // Check if the last element is a rest element. If so then we want to save the
  // element and handle it separately after we iterate through the other
  // formals. This also enforces that a rest element may only ever be in the
  // last position.
  let restEl;
  if (elements.length > 0) {
    let lastEl = elements[elements.length - 1];
    if (lastEl !== null && lastEl.type === "RestElement") {
      restEl = lastEl;
      elements = elements.slice(0, -1);
    }
  }

  for (let element of elements) {
    if (element === null) {
      // Elision handling

      // 1. If iteratorRecord.[[Done]] is false, then
      if (iteratorRecord.$Done === false) {
        // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
        let next;
        try {
          next = IteratorStep(realm, iteratorRecord.$Iterator);
        } catch (e) {
          // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // c. ReturnIfAbrupt(next).
          throw e;
        }
        // d. If next is false, set iteratorRecord.[[Done]] to true.
        if (next === false) {
          iteratorRecord.$Done = true;
        }
      }
      // 2. Return NormalCompletion(empty).
      continue;
    }

    // AssignmentElement : DestructuringAssignmentTarget Initializer

    let DestructuringAssignmentTarget;
    let Initializer;

    if (element.type === "AssignmentPattern") {
      Initializer = element.right;
      DestructuringAssignmentTarget = element.left;
    } else {
      DestructuringAssignmentTarget = element;
    }

    let lref;

    // 1. If DestructuringAssignmentTarget is neither an ObjectLiteral nor an ArrayLiteral, then
    //
    // The spec assumes we haven't yet distinguished between literals and
    // patterns, but our parser does that work for us. That means we check for
    // "*Pattern" instead of "*Literal" like the spec text suggests.
    if (
      DestructuringAssignmentTarget.type !== "ObjectPattern" &&
      DestructuringAssignmentTarget.type !== "ArrayPattern"
    ) {
      // a. Let lref be the result of evaluating DestructuringAssignmentTarget.
      lref = env.evaluate(DestructuringAssignmentTarget, strictCode);

      // b. ReturnIfAbrupt(lref).
    }

    let value;

    // 2. If iteratorRecord.[[Done]] is false, then
    if (iteratorRecord.$Done === false) {
      // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
      let next;
      try {
        next = IteratorStep(realm, iteratorRecord.$Iterator);
      } catch (e) {
        // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
        if (e instanceof AbruptCompletion) {
          iteratorRecord.$Done = true;
        }
        // c. ReturnIfAbrupt(next).
        throw e;
      }

      // d. If next is false, set iteratorRecord.[[Done]] to true.
      if (next === false) {
        iteratorRecord.$Done = true;
        // Normally this assignment would be done in step 3, but we do it
        // here so that Flow knows `value` will always be initialized by step 4.
        value = realm.intrinsics.undefined;
      } else {
        // e. Else,
        // i. Let value be IteratorValue(next).
        try {
          value = IteratorValue(realm, next);
        } catch (e) {
          // ii. If value is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // iii. ReturnIfAbrupt(v).
          throw e;
        }
      }
    } else {
      // 3. If iteratorRecord.[[Done]] is true, let value be undefined.
      value = realm.intrinsics.undefined;
    }

    let v;

    // 4. If Initializer is present and value is undefined, then
    if (Initializer && value instanceof UndefinedValue) {
      // a. Let defaultValue be the result of evaluating Initializer.
      let defaultValue = env.evaluate(Initializer, strictCode);

      // b. Let v be ? GetValue(defaultValue).
      v = Environment.GetValue(realm, defaultValue);
    } else {
      // 5. Else, let v be value.
      v = value;
    }

    // 6. If DestructuringAssignmentTarget is an ObjectLiteral or an ArrayLiteral, then
    //
    // The spec assumes we haven't yet distinguished between literals and
    // patterns, but our parser does that work for us. That means we check for
    // "*Pattern" instead of "*Literal" like the spec text suggests.
    if (
      DestructuringAssignmentTarget.type === "ObjectPattern" ||
      DestructuringAssignmentTarget.type === "ArrayPattern"
    ) {
      // a. Let nestedAssignmentPattern be the parse of the source text corresponding to DestructuringAssignmentTarget using either AssignmentPattern or AssignmentPattern[Yield] as the goal symbol depending upon whether this AssignmentElement has the [Yield] parameter.
      let nestedAssignmentPattern = DestructuringAssignmentTarget;

      // b. Return the result of performing DestructuringAssignmentEvaluation of nestedAssignmentPattern with v as the argument.
      DestructuringAssignmentEvaluation(realm, nestedAssignmentPattern, v, strictCode, env);
      continue;
    }

    // We know `lref` exists because of how the algorithm is setup, but tell
    // Flow that `lref` exists with an `invariant()`.
    invariant(lref);

    // 7. If Initializer is present and value is undefined and IsAnonymousFunctionDefinition(Initializer) and IsIdentifierRef of DestructuringAssignmentTarget are both true, then
    if (
      Initializer &&
      value instanceof UndefinedValue &&
      IsAnonymousFunctionDefinition(realm, Initializer) &&
      IsIdentifierRef(realm, DestructuringAssignmentTarget) &&
      v instanceof ObjectValue
    ) {
      // a. Let hasNameProperty be ? HasOwnProperty(v, "name").
      let hasNameProperty = HasOwnProperty(realm, v, "name");

      // b. If hasNameProperty is false, perform SetFunctionName(v, GetReferencedName(lref)).
      if (hasNameProperty === false) {
        // All of the nodes that may be evaluated to produce lref create
        // references. Assert this with an invariant as GetReferencedName may
        // not be called with a value.
        invariant(lref instanceof Reference);

        Functions.SetFunctionName(realm, v, Environment.GetReferencedName(realm, lref));
      }
    }

    // 8. Return ? PutValue(lref, v).
    Properties.PutValue(realm, lref, v);
    continue;
  }

  // Handle the rest element if we have one.
  if (restEl) {
    // AssignmentRestElement : ...DestructuringAssignmentTarget
    let DestructuringAssignmentTarget = restEl.argument;

    let lref;

    // 1. If DestructuringAssignmentTarget is neither an ObjectLiteral nor an ArrayLiteral, then
    //
    // The spec assumes we haven't yet distinguished between literals and
    // patterns, but our parser does that work for us. That means we check for
    // "*Pattern" instead of "*Literal" like the spec text suggests.
    if (
      DestructuringAssignmentTarget.type !== "ObjectPattern" &&
      DestructuringAssignmentTarget.type !== "ArrayPattern"
    ) {
      // a. Let lref be the result of evaluating DestructuringAssignmentTarget.
      lref = env.evaluate(DestructuringAssignmentTarget, strictCode);

      // b. ReturnIfAbrupt(lref).
    }

    // 2. Let A be ArrayCreate(0).
    let A = Create.ArrayCreate(realm, 0);

    // 3. Let n be 0.
    let n = 0;

    // 4. Repeat while iteratorRecord.[[Done]] is false,
    while (iteratorRecord.$Done === false) {
      // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
      let next;
      try {
        next = IteratorStep(realm, iteratorRecord.$Iterator);
      } catch (e) {
        // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
        if (e instanceof AbruptCompletion) {
          iteratorRecord.$Done = true;
        }
        // c. ReturnIfAbrupt(next).
        throw e;
      }

      // d. If next is false, set iteratorRecord.[[Done]] to true.
      if (next === false) {
        iteratorRecord.$Done = true;
      } else {
        // e. Else,
        // i. Let nextValue be IteratorValue(next).
        let nextValue;
        try {
          nextValue = IteratorValue(realm, next);
        } catch (e) {
          // ii. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
          if (e instanceof AbruptCompletion) {
            iteratorRecord.$Done = true;
          }
          // iii. ReturnIfAbrupt(nextValue).
          throw e;
        }

        // iv. Let status be CreateDataProperty(A, ! ToString(n), nextValue).
        let status = Create.CreateDataProperty(realm, A, n.toString(), nextValue);

        // v. Assert: status is true.
        invariant(status, "expected to create data property");

        // vi. Increment n by 1.
        n += 1;
      }
    }

    // 5. If DestructuringAssignmentTarget is neither an ObjectLiteral nor an ArrayLiteral, then
    if (
      DestructuringAssignmentTarget.type !== "ObjectPattern" &&
      DestructuringAssignmentTarget.type !== "ArrayPattern"
    ) {
      // `lref` will always be defined at this point. Let Flow know with an
      // invariant.
      invariant(lref);

      // a. Return ? PutValue(lref, A).
      Properties.PutValue(realm, lref, A);
    } else {
      // 6. Let nestedAssignmentPattern be the parse of the source text corresponding to DestructuringAssignmentTarget using either AssignmentPattern or AssignmentPattern[Yield] as the goal symbol depending upon whether this AssignmentElement has the [Yield] parameter.
      let nestedAssignmentPattern = DestructuringAssignmentTarget;

      // 7. Return the result of performing DestructuringAssignmentEvaluation of nestedAssignmentPattern with A as the argument.
      DestructuringAssignmentEvaluation(realm, nestedAssignmentPattern, A, strictCode, env);
    }
  }
}

// ECMA262 12.15.5.4
export function KeyedDestructuringAssignmentEvaluation(
  realm: Realm,
  node: BabelNodeLVal,
  value: Value,
  propertyName: PropertyKeyValue,
  strictCode: boolean,
  env: LexicalEnvironment
) {
  let DestructuringAssignmentTarget;
  let Initializer;

  if (node.type === "AssignmentPattern") {
    Initializer = node.right;
    DestructuringAssignmentTarget = node.left;
  } else {
    DestructuringAssignmentTarget = node;
  }

  let lref;

  // 1. If DestructuringAssignmentTarget is neither an ObjectLiteral nor an ArrayLiteral, then
  //
  // The spec assumes we haven't yet distinguished between literals and
  // patterns, but our parser does that work for us. That means we check for
  // "*Pattern" instead of "*Literal" like the spec text suggests.
  if (DestructuringAssignmentTarget.type !== "ObjectPattern" && DestructuringAssignmentTarget.type !== "ArrayPattern") {
    // a. Let lref be the result of evaluating DestructuringAssignmentTarget.
    lref = env.evaluate(DestructuringAssignmentTarget, strictCode);

    // b. ReturnIfAbrupt(lref).
  }

  let rhsValue;

  // 2. Let v be ? GetV(value, propertyName).
  let v = GetV(realm, value, propertyName);

  // 3. If Initializer is present and v is undefined, then
  if (Initializer && v instanceof UndefinedValue) {
    // a. Let defaultValue be the result of evaluating Initializer.
    let defaultValue = env.evaluate(Initializer, strictCode);

    // b. Let rhsValue be ? GetValue(defaultValue).
    rhsValue = Environment.GetValue(realm, defaultValue);
  } else {
    // 4. Else, let rhsValue be v.
    rhsValue = v;
  }

  // 5. If DestructuringAssignmentTarget is an ObjectLiteral or an ArrayLiteral, then
  //
  // The spec assumes we haven't yet distinguished between literals and
  // patterns, but our parser does that work for us. That means we check for
  // "*Pattern" instead of "*Literal" like the spec text suggests.
  if (DestructuringAssignmentTarget.type === "ObjectPattern" || DestructuringAssignmentTarget.type === "ArrayPattern") {
    // a. Let assignmentPattern be the parse of the source text corresponding to DestructuringAssignmentTarget using either AssignmentPattern or AssignmentPattern[Yield] as the goal symbol depending upon whether this AssignmentElement has the [Yield] parameter.
    let assignmentPattern = DestructuringAssignmentTarget;

    // b. Return the result of performing DestructuringAssignmentEvaluation of assignmentPattern with rhsValue as the argument.
    return DestructuringAssignmentEvaluation(realm, assignmentPattern, rhsValue, strictCode, env);
  }

  // `lref` will always be defined at this point. Let Flow know with an
  // invariant.
  invariant(lref);

  // 6. If Initializer is present and v is undefined and IsAnonymousFunctionDefinition(Initializer) and IsIdentifierRef of DestructuringAssignmentTarget are both true, then
  if (
    Initializer &&
    v instanceof UndefinedValue &&
    IsAnonymousFunctionDefinition(realm, Initializer) &&
    IsIdentifierRef(realm, DestructuringAssignmentTarget) &&
    rhsValue instanceof ObjectValue
  ) {
    // a. Let hasNameProperty be ? HasOwnProperty(rhsValue, "name").
    let hasNameProperty = HasOwnProperty(realm, rhsValue, "name");

    // b. If hasNameProperty is false, perform SetFunctionName(rhsValue, GetReferencedName(lref)).
    if (hasNameProperty === false) {
      // All of the nodes that may be evaluated to produce lref create
      // references. Assert this with an invariant as GetReferencedName may
      // not be called with a value.
      invariant(lref instanceof Reference);

      Functions.SetFunctionName(realm, rhsValue, Environment.GetReferencedName(realm, lref));
    }
  }

  // 7. Return ? PutValue(lref, rhsValue).
  return Properties.PutValue(realm, lref, rhsValue);
}
