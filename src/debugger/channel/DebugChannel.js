/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import typeof fs from "fs";
import type { DebuggerOptions } from "./../../options.js";
import invariant from "./../../invariant.js";
import { FileIOWrapper } from "./FileIOWrapper.js";
import { DebugMessage } from "./DebugMessage.js";

//Channel used by the DebugServer in Prepack to communicate with the debug adapter
export class DebugChannel {
  constructor(fileSystem: fs, dbgOptions: DebuggerOptions) {
    this._requestReceived = false;
    this._ioWrapper = new FileIOWrapper(false, fileSystem, dbgOptions.inFilePath, dbgOptions.outFilePath);
  }

  _inFilePath: string;
  _outFilePath: string;
  _requestReceived: boolean;
  _ioWrapper: FileIOWrapper;

  /*
  /* Only called in the beginning to check if a debugger is attached
  */
  debuggerIsAttached(): boolean {
    let message = this._ioWrapper.readInSyncOnce();
    if (message === DebugMessage.DEBUGGER_ATTACHED) {
      this._requestReceived = true;
      this._ioWrapper.clearInFile();
      this.writeOut(DebugMessage.PREPACK_READY);
      return true;
    }
    return false;
  }

  /* Reads in a request from the debug adapter
  /* The caller is responsible for sending a response with the appropriate
  /* contents at the right time.
  */
  readIn(): string {
    let message = this._ioWrapper.readInSync();
    this._requestReceived = true;
    return message;
  }

  // Write out a response to the debug adapter
  writeOut(contents: string): void {
    //Prepack only writes back to the debug adapter in response to a request
    invariant(this._requestReceived);
    this._ioWrapper.writeOutSync(contents);
    this._requestReceived = false;
  }
}
