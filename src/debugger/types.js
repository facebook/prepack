/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { LexicalEnvironment } from "./../environment.js";
import * as DebugProtocol from "vscode-debugprotocol";
export type DebuggerRequest = {
  id: number,
  command: string,
  arguments: DebuggerRequestArguments,
};

export type DebuggerRequestArguments =
  | BreakpointArguments
  | RunArguments
  | StackframeArguments
  | ScopesArguments
  | VariablesArguments;

export type PrepackLaunchArguments = {
  kind: "launch",
  prepackRuntime: string,
  prepackArguments: Array<string>,
  sourceFile: string,
  debugInFilePath: string,
  debugOutFilePath: string,
  outputCallback: Buffer => void,
  exitCallback: () => void,
};

export type BreakpointArguments = {
  kind: "breakpoint",
  filePath: string,
  line: number,
  column: number,
};

export type RunArguments = {
  kind: "run",
};

export type StackframeArguments = {
  kind: "stackframe",
};

export type Stackframe = {
  id: number,
  fileName: string,
  line: number,
  column: number,
  functionName: string,
};

export type ScopesArguments = {
  kind: "scopes",
  frameId: number,
};

export type VariablesArguments = {
  kind: "variables",
  variablesReference: number,
};

export type DebuggerResponse = {
  id: number,
  result: DebuggerResponseResult,
};

export type DebuggerResponseResult =
  | ReadyResult
  | StackframeResult
  | BreakpointAddResult
  | BreakpointStoppedResult
  | ScopesResult
  | VariablesResult;

export type ReadyResult = {
  kind: "ready",
};

export type StackframeResult = {
  kind: "stackframe",
  stackframes: Array<Stackframe>,
};

export type BreakpointAddResult = {
  kind: "breakpoint-add",
};

export type BreakpointStoppedResult = {
  kind: "breakpoint-stopped",
  filePath: string,
  line: number,
  column: number,
};
export type Scope = {
  name: string,
  variablesReference: number,
  expensive: boolean,
};

export type ScopesResult = {
  kind: "scopes",
  scopes: Array<Scope>,
};

export type Variable = {
  name: string,
  value: string,
  variablesReference: number,
};

export type VariablesResult = {
  kind: "variables",
  variables: Array<Variable>,
};

// any object that can contain a collection of variables
export type VariableContainer = LexicalEnvironment;
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  noDebug?: boolean,
  sourceFile: string,
  prepackRuntime: string,
  prepackArguments: Array<string>,
  debugInFilePath: string,
  debugOutFilePath: string,
}
