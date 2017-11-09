/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import { AbstractValue, NativeFunctionValue, Value, StringValue } from "../../values/index.js";
import { ObjectCreate } from "../../methods/index.js";
import buildExpressionTemplate from "../../utils/builder.js";
import { createMockReact } from "./mocks.js";
import invariant from "../../invariant";

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  // module.exports support
  let exportsValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  exportsValue.intrinsicName = "exports";
  let moduleValue = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  moduleValue.intrinsicName = "module";
  moduleValue.$Set("exports", exportsValue, moduleValue);

  global.$DefineOwnProperty("module", {
    value: moduleValue,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  // apply React mock (for now just React.Component)
  global.$DefineOwnProperty("require", {
    value: new NativeFunctionValue(realm, "global.require", "require", 0, (context, [requireNameVal]) => {
      invariant(requireNameVal instanceof StringValue);
      if (requireNameVal.value === "react" || requireNameVal.value === "React") {
        return createMockReact(realm);
      }
      let requireName = `require("${requireNameVal.value}")`;
      let type = Value.getTypeFromName("function");
      let requireValue = AbstractValue.createFromTemplate(
        realm,
        buildExpressionTemplate(requireName),
        ((type: any): typeof Value),
        [],
        requireName
      );
      requireValue.intrinsicName = requireName;
      return requireValue;
    }),
    writable: true,
    enumerable: false,
    configurable: true,
  });
}
