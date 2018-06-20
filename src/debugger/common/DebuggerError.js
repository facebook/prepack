/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

// More error types will be added as needed
export type DebuggerErrorType = "Invalid command" | "Invalid response" | "Startup Error";

export class DebuggerError extends Error {
  constructor(errorType: DebuggerErrorType, message: string) {
    super(`${errorType}: ${message}`);
    this.errorType = errorType;
    this.message = message;
  }
  errorType: DebuggerErrorType;
  message: string;
}
