/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as Singletons from "./singletons.js";
import { PathImplementation } from "./utils/paths.js";
import { PropertiesImplementation } from "./methods/properties.js";

export default function() {
  Singletons.setPath(new PathImplementation());
  Singletons.setProperties((new PropertiesImplementation(): any));
}
