/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeClassExpression, BabelNodeStatement } from "babel-types";
import type { LexicalEnvironment } from "../environment.js";
import { FatalError } from "../errors.js";
import type { Realm } from "../realm.js";

import { AbruptCompletion } from "../completions.js";
import { Value } from "../values/index.js";

export default function(
  ast: BabelNodeClassExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [AbruptCompletion | Value, BabelNodeClassExpression, Array<BabelNodeStatement>] {
  throw new FatalError("TODO: ClassExpression");
}
