/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeBreakStatement, BabelNodeStatement } from "babel-types";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";

import { BreakCompletion } from "../completions.js";

export default function (
  ast: BabelNodeBreakStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm
): [BreakCompletion, BabelNodeBreakStatement, Array<BabelNodeStatement>] {
  let result = new BreakCompletion(realm.intrinsics.empty, ast.label && ast.label.name);
  return [result, ast, []];
}
