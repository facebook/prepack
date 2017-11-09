/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// A map with an incrementing counter as the keys
// Used to store references to variable collections since DebugProtocol
// specifies fetching variable collections via unique IDs
export class ReferenceMap<T> {
  constructor() {
    // index 0 is reserved for indicating there are no nested variables so we
    // don't let any defined value occupy it here
    this._mapping = [undefined];
  }
  _mapping: Array<void | T>;

  add(value: T): number {
    this._mapping.push(value);
    return this._mapping.length - 1;
  }

  get(reference: number): void | T {
    return this._mapping[reference];
  }
}
