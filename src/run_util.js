/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { run } from "./prepack.js";

let args = Array.from(process.argv);
args.splice(0, 2);
let inputFilename;
let outputFilename;
let compatibility;
let mathRandomSeed;
let inputMap;
let ouputMap;
let binArgs = {
  speculate: false,
  trace: false,
  debugNames: false,
  singlePass: false };
while (args.length) {
  let arg = args[0]; args.shift();
  if (!arg.startsWith("--")) {
    inputFilename = arg;
  } else {
    arg = arg.slice(2);
    switch (arg) {
      case "out":
        arg = args[0]; args.shift();
        outputFilename = arg;
        break;
      case "compatibility":
        arg = args[0]; args.shift();
        if (arg !== "jsc") {
          console.error(`Unsupported compatibility: ${arg}`);
          process.exit(1);
        } else {
          compatibility = arg;
        }
        break;
      case "mathRandomSeed":
        mathRandomSeed = args[0]; args.shift();
        break;
      case "srcmapIn":
        inputMap = args[0]; args.shift();
        break;
      case "srcmapOut":
        ouputMap = args[0]; args.shift();
        break;
      case "speculate":
      case "trace":
      case "debugNames":
      case "singlePass":
        console.log(arg);
        binArgs[arg] = true;
        break;
      case "help":
        console.log("Usage: prepack.js [ --out output.js ] [ --compatibility jsc ] [ --mathRandomSeed seedvalue ] [ --srcmapIn inputMap ] [ --srcmapOut outputMap ] [ --speculate ] [ --trace ] [ -- | input.js ] [ --singlePass ] [ --debugNames ]");
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }
}
console.log(`${binArgs.speculate} ${binArgs.trace} ${binArgs.debugNames} ${binArgs.singlePass}`);
if (!inputFilename) {
  console.error("Missing input file.");
  process.exit(1);
} else {
  run(inputFilename, compatibility, mathRandomSeed, outputFilename, inputMap, ouputMap, binArgs.speculate, binArgs.trace, binArgs.debugNames, binArgs.singlePass);
}
