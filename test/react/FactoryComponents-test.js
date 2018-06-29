/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

const prepareReactTests = require("./prepareReactTests");
const { runTest } = prepareReactTests();

/* eslint-disable no-undef */
const { it } = global;

it("Simple factory classes", async () => {
  await runTest(__dirname + "/FactoryComponents/simple.js");
});

it("Simple factory classes 2", async () => {
  await runTest(__dirname + "/FactoryComponents/simple2.js");
});
