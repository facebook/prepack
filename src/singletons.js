/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { PathType, PropertiesType } from "./types.js";

export let Path: PathType = (null: any);
export let Properties: PropertiesType = (null: any);

export function setPath(singleton: PathType) {
  Path = singleton;
}

export function setProperties(singleton: PropertiesType) {
  Properties = singleton;
}
