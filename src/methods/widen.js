/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Binding } from "../environment.js";
import { FatalError } from "../errors.js";
import type { Bindings, Effects, EvaluationResult, PropertyBindings, CreatedObjects, Realm } from "../realm.js";
import type { Descriptor, PropertyBinding } from "../types.js";

import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import { Reference } from "../environment.js";
import { cloneDescriptor, equalDescriptors, IsDataDescriptor, StrictEqualityComparison } from "../methods/index.js";
import { Generator } from "../utils/generator.js";
import { AbstractValue, ObjectValue, Value } from "../values/index.js";

import invariant from "../invariant.js";

export class WidenImplementation {
  _widenArrays(
    realm: Realm,
    v1: void | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,
    v2: void | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>
  ): Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }> {
    let e = (v1 && v1[0]) || (v2 && v2[0]);
    if (e instanceof Value) return this._widenArraysOfValues(realm, (v1: any), (v2: any));
    else return this._widenArrayOfsMapEntries(realm, (v1: any), (v2: any));
  }

  _widenArrayOfsMapEntries(
    realm: Realm,
    a1: void | Array<{ $Key: void | Value, $Value: void | Value }>,
    a2: void | Array<{ $Key: void | Value, $Value: void | Value }>
  ): Array<{ $Key: void | Value, $Value: void | Value }> {
    let empty = realm.intrinsics.empty;
    let n = Math.max((a1 && a1.length) || 0, (a2 && a2.length) || 0);
    let result: Array<{ $Key: void | Value, $Value: void | Value }> = [];
    for (let i = 0; i < n; i++) {
      let { $Key: key1, $Value: val1 } = (a1 && a1[i]) || { $Key: empty, $Value: empty };
      let { $Key: key2, $Value: val2 } = (a2 && a2[i]) || { $Key: empty, $Value: empty };
      if (key1 === undefined && key2 === undefined) {
        result[i] = { $Key: undefined, $Value: undefined };
      } else {
        let key3 = this.widenValues(realm, key1, key2);
        invariant(key3 instanceof Value);
        let val3 = this.widenValues(realm, val1, val2);
        invariant(val3 === undefined || val3 instanceof Value);
        result[i] = { $Key: key3, $Value: val3 };
      }
    }
    return result;
  }

  _widenArraysOfValues(realm: Realm, a1: void | Array<Value>, a2: void | Array<Value>): Array<Value> {
    let n = Math.max((a1 && a1.length) || 0, (a2 && a2.length) || 0);
    let result = [];
    for (let i = 0; i < n; i++) {
      let wv = this.widenValues(realm, (a1 && a1[i]) || undefined, (a2 && a2[i]) || undefined);
      invariant(wv === undefined || wv instanceof Value);
      result[i] = wv;
    }
    return result;
  }

  // Returns a new effects summary that includes both e1 and e2.
  widenEffects(realm: Realm, e1: Effects, e2: Effects): Effects {
    let [result1, , bindings1, properties1, createdObj1] = e1;
    let [result2, , bindings2, properties2, createdObj2] = e2;

    let result = this.widenResults(realm, result1, result2);
    let bindings = this.widenBindings(realm, bindings1, bindings2);
    let properties = this.widenPropertyBindings(realm, properties1, properties2, createdObj1, createdObj2);
    let createdObjects = new Set(); // Top, since the empty set knows nothing. There is no other choice for widen.
    let generator = new Generator(realm); // code subject to widening will be generated somewhere else
    return [result, generator, bindings, properties, createdObjects];
  }

  widenResults(realm: Realm, result1: EvaluationResult, result2: EvaluationResult): PossiblyNormalCompletion | Value {
    invariant(!(result1 instanceof Reference || result2 instanceof Reference), "loop bodies should not result in refs");
    invariant(
      !(result1 instanceof AbruptCompletion || result2 instanceof AbruptCompletion),
      "if a loop iteration ends abruptly, there is no need for fixed point computation"
    );
    if (result1 instanceof Value && result2 instanceof Value) {
      let val = this.widenValues(realm, result1, result2);
      invariant(val instanceof Value);
      return val;
    }
    if (result1 instanceof PossiblyNormalCompletion && result2 instanceof PossiblyNormalCompletion) {
      //todo: #1174 figure out how to deal with loops that have embedded conditional exits
      // widen join pathConditions
      // widen normal result and Effects
      // use abrupt part of result2, depend stability to make this safe. See below.
      throw new FatalError();
    }
    // todo: #1174 figure out what a stable result is and how to check it
    invariant(false, "widening should happen only after result type has stablized");
  }

  widenMaps<K, V>(m1: Map<K, void | V>, m2: Map<K, void | V>, widen: (K, void | V, void | V) => V): Map<K, void | V> {
    let m3: Map<K, void | V> = new Map();
    m1.forEach((val1, key, map1) => {
      let val2 = m2.get(key);
      let val3 = widen(key, val1, val2);
      m3.set(key, val3);
    });
    m2.forEach((val2, key, map2) => {
      if (!m1.has(key)) {
        m3.set(key, widen(key, undefined, val2));
      }
    });
    return m3;
  }

  widenBindings(realm: Realm, m1: Bindings, m2: Bindings): Bindings {
    let widen = (b: Binding, v1: void | Value, v2: void | Value) => {
      let result = this.widenValues(realm, v1 || b.value, v2 || b.value);
      invariant(result instanceof Value);
      return result;
    };
    return this.widenMaps(m1, m2, widen);
  }

  // Returns an abstract value that includes both v1 and v2 as potential values.
  widenValues(
    realm: Realm,
    v1: void | Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,
    v2: void | Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>
  ): Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }> {
    if (Array.isArray(v1) || Array.isArray(v2)) {
      invariant(v1 === undefined || Array.isArray(v1));
      invariant(v2 === undefined || Array.isArray(v2));
      return this._widenArrays(realm, ((v1: any): void | Array<Value>), ((v2: any): void | Array<Value>));
    }
    invariant(v1 === undefined || v1 instanceof Value);
    invariant(v2 === undefined || v2 instanceof Value);
    if (
      v1 !== undefined &&
      v2 !== undefined &&
      !(v1 instanceof AbstractValue) &&
      !(v2 instanceof AbstractValue) &&
      StrictEqualityComparison(realm, v1.throwIfNotConcrete(), v2.throwIfNotConcrete())
    ) {
      return v1; // no need to widen a loop invariant value
    } else {
      return AbstractValue.createFromWidening(
        realm,
        v1 || realm.intrinsics.undefined,
        v2 || realm.intrinsics.undefined
      );
    }
  }

  widenPropertyBindings(
    realm: Realm,
    m1: PropertyBindings,
    m2: PropertyBindings,
    c1: CreatedObjects,
    c2: CreatedObjects
  ): PropertyBindings {
    let widen = (b: PropertyBinding, d1: void | Descriptor, d2: void | Descriptor) => {
      invariant(d1 !== undefined || d2 !== undefined, "widenMaps ensures that this cannot happen");
      // If the PropertyBinding object has been freshly allocated do not widen (that happens in AbstractObjectValue)
      if (d1 === undefined) {
        if (b.object instanceof ObjectValue && c2.has(b.object)) return d2; // no widen
        if (b.descriptor !== undefined && m1.has(b)) {
          // property was present in (n-1)th iteration and deleted in nth iteration
          d1 = cloneDescriptor(b.descriptor);
          invariant(d1 !== undefined);
          d1.value = realm.intrinsics.empty;
        } else {
          // no write to property in nth iteration, use the value from the (n-1)th iteration
          d1 = b.descriptor;
        }
      }
      if (d2 === undefined) {
        if (b.object instanceof ObjectValue && c1.has(b.object)) return d1; // no widen
        if (m2.has(b)) {
          // property was present in nth iteration and deleted in (n+1)th iteration
          d2 = cloneDescriptor(d1);
          invariant(d2 !== undefined);
          d2.value = realm.intrinsics.empty;
        } else {
          // no write to property in (n+1)th iteration, use the value from the nth iteration
          d2 = d1;
        }
        invariant(d2 !== undefined);
      }
      return this.widenDescriptors(realm, d1, d2);
    };
    return this.widenMaps(m1, m2, widen);
  }

  widenDescriptors(realm: Realm, d1: void | Descriptor, d2: Descriptor): void | Descriptor {
    if (d1 === undefined) {
      // d2 is a property written to only in the (n+1)th iteration
      return d2; // no widening needed. Note that another fixed point iteration will occur.
    } else {
      if (equalDescriptors(d1, d2)) {
        if (!IsDataDescriptor(realm, d1)) return d1; // identical accessor properties need not be widened.
        let dc = cloneDescriptor(d1);
        invariant(dc !== undefined);
        dc.value = this.widenValues(realm, d1.value, d2.value);
        return dc;
      }
      //todo: #1174 if we get here, the loop body contains a call to create a property and different iterations
      // create them differently. That seems beyond what a fixpoint computation can reasonably handle without
      // losing precision. Report an error here.
      throw new FatalError();
    }
  }

  // If e2 is the result of a loop iteration starting with effects e1 and it has the same elements as e1,
  // then we have reached a fixed point and no further calls to widen are needed. e1/e2 represent a general
  // summary of the loop, regardless of how many iterations will be performed at runtime.
  equalsEffects(e1: Effects, e2: Effects): boolean {
    let [result1, , bindings1, properties1] = e1;
    let [result2, , bindings2, properties2] = e2;

    if (!this.equalsResults(result1, result2)) return false;
    if (!this.equalsBindings(bindings1, bindings2)) return false;
    if (!this.equalsPropertyBindings(properties1, properties2)) return false;
    return true;
  }

  equalsResults(result1: EvaluationResult, result2: EvaluationResult): boolean {
    if (result1 instanceof Value && result2 instanceof Value) return result1.equals(result2);
    return false;
  }

  equalsMap<K, V>(m1: Map<K, void | V>, m2: Map<K, void | V>, f: (void | V, void | V) => boolean): boolean {
    m1.forEach((val1, key, map1) => {
      let val2 = m2.get(key);
      if (val2 === undefined || !f(val2, val1)) return false;
    });
    m2.forEach((val2, key, map2) => {
      if (!m1.has(key)) return false;
    });
    return true;
  }

  equalsBindings(m1: Bindings, m2: Bindings): boolean {
    let equalsBinding = (v1: void | Value, v2: void | Value) => {
      if (v1 === undefined || v2 === undefined || !v1.equals(v2)) return false;
      return true;
    };
    return this.equalsMap(m1, m2, equalsBinding);
  }

  equalsPropertyBindings(m1: PropertyBindings, m2: PropertyBindings): boolean {
    let equalsPropertyBinding = (d1: void | Descriptor, d2: void | Descriptor) => {
      if (d1 === undefined || d2 === undefined) return false;
      let [v1, v2] = [d1.value, d2.value];
      if (v1 === undefined) return v2 === undefined;
      if (v1 instanceof Value && v2 instanceof Value && !v1.equals(v2)) return false;
      if (Array.isArray(v1) && Array.isArray(v2)) {
        return this._equalsArray(((v1: any): Array<Value>), ((v2: any): Array<Value>));
      }
      return false;
    };
    return this.equalsMap(m1, m2, equalsPropertyBinding);
  }

  _equalsArray(
    v1: void | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,
    v2: void | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>
  ): boolean {
    let e = (v1 && v1[0]) || (v2 && v2[0]);
    if (e instanceof Value) return this._equalsArraysOfValue((v1: any), (v2: any));
    else return this._equalsArrayOfsMapEntries((v1: any), (v2: any));
  }

  _equalsArraysOfValue(
    realm: Realm,
    a1: void | Array<{ $Key: void | Value, $Value: void | Value }>,
    a2: void | Array<{ $Key: void | Value, $Value: void | Value }>
  ): boolean {
    let empty = realm.intrinsics.empty;
    let n = Math.max((a1 && a1.length) || 0, (a2 && a2.length) || 0);
    for (let i = 0; i < n; i++) {
      let { $Key: key1, $Value: val1 } = (a1 && a1[i]) || { $Key: empty, $Value: empty };
      let { $Key: key2, $Value: val2 } = (a2 && a2[i]) || { $Key: empty, $Value: empty };
      if (key1 === undefined) {
        if (key2 !== undefined) return false;
      } else {
        if (key1 instanceof Value && key2 instanceof Value && key1.equals(key2)) {
          if (val1 instanceof Value && val2 instanceof Value && val1.equals(val2)) continue;
        }
        return false;
      }
    }
    return true;
  }

  _equalsArrayOfsMapEntries(realm: Realm, a1: void | Array<Value>, a2: void | Array<Value>): boolean {
    let n = Math.max((a1 && a1.length) || 0, (a2 && a2.length) || 0);
    for (let i = 0; i < n; i++) {
      let [val1, val2] = [a1 && a1[i], a2 && a2[i]];
      if (val1 instanceof Value && val2 instanceof Value && !val1.equals(val2)) return false;
    }
    return false;
  }
}
