/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

/* API functions for running Prepack on code that expects to run on Node */

import invariant from "./invariant.js";
import { ExecutionContext } from "./realm.js";
import Serializer from "./serializer/index.js";
import { Completion } from "./completions.js";
import { Value } from "./values";
import construct_realm from "./construct_realm.js";
import initializeGlobals from "./globals.js";
import { getRealmOptions, getSerializerOptions } from "./prepack-options";
import { FatalError } from "./errors.js";
import initializeBootstrap from "./intrinsics/node/bootstrap.js";
import initializeProcess from "./intrinsics/node/process.js";

import type { PrepackOptions } from "./prepack-options";
import { defaultOptions } from "./options";
import type { SourceMap } from "./types.js";

declare var process: any;

export function prepackNodeCLI(
  filename: string,
  options: PrepackOptions = defaultOptions,
  callback: (any, ?{ code: string, map?: SourceMap }) => void
) {
  let serialized;
  try {
    serialized = prepackNodeCLISync(filename, options);
  } catch (err) {
    callback(err);
    return;
  }
  callback(null, serialized);
}

export function prepackNodeCLISync(filename: string, options: PrepackOptions = defaultOptions) {
  if (process.version !== "v7.9.0") {
    console.warn(
      `Prepack's node-cli mode currently only works on Node v7.9.0.\n` +
        `You are running version ${process.version} which will likely fail.`
    );
  }

  let realm = construct_realm(getRealmOptions(options));
  initializeGlobals(realm);

  let processObj = initializeProcess(realm, ["node", filename]);
  let bootstrapFn = initializeBootstrap(realm);

  let serializer = new Serializer(realm, getSerializerOptions(options));

  let context = new ExecutionContext();
  context.lexicalEnvironment = realm.$GlobalEnv;
  context.variableEnvironment = realm.$GlobalEnv;
  context.realm = realm;
  realm.pushContext(context);
  let res;
  try {
    if (bootstrapFn.$Call) {
      res = bootstrapFn.$Call(realm.intrinsics.null, [processObj]);
    }
  } catch (err) {
    if (err instanceof Completion) {
      res = err;
    } else if (err instanceof Error) {
      throw err;
    } else {
      throw new FatalError(err);
    }
  } finally {
    realm.popContext(context);
  }
  if (res instanceof Completion) {
    context = new ExecutionContext();
    realm.pushContext(context);
    try {
      serializer.logger.logCompletion(res);
    } finally {
      realm.popContext(context);
      realm.onDestroyScope(realm.$GlobalEnv);
    }
  }

  // Hack: Turn these objects generated by the bootstrap script into
  // intrinsics that exist in a preinitialized environment. This ensures
  // that we don't end up with duplicates of these. This won't work in an
  // uninitialized environment.
  let nextTick = realm.$GlobalEnv.execute("process.nextTick", "", "");
  invariant(nextTick instanceof Value);
  nextTick.intrinsicName = "process.nextTick";
  let tickCallback = realm.$GlobalEnv.execute("process._tickCallback", "", "");
  invariant(tickCallback instanceof Value);
  tickCallback.intrinsicName = "process._tickCallback";
  let tickDomainCallback = realm.$GlobalEnv.execute("process._tickDomainCallback", "", "");
  invariant(tickDomainCallback instanceof Value);
  tickDomainCallback.intrinsicName = "process._tickDomainCallback";

  // Serialize
  let sources = [{ filePath: "", fileContents: "" }];
  let serialized = serializer.init(sources, options.sourceMaps);
  if (!serialized) {
    throw new FatalError("serializer failed");
  }
  return serialized;
}