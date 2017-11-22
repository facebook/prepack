/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { PerFileBreakpointMap } from "./PerFileBreakpointMap.js";
import { Breakpoint } from "./Breakpoint.js";
import type { Breakpoint as BreakpointType } from "./types.js";

// Storing BreakpointStores for all source files
export class BreakpointManager {
  constructor() {
    this._breakpointMaps = new Map();
  }
  _breakpointMaps: Map<string, PerFileBreakpointMap>;

  addBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._addBreakpoint.bind(this));
  }

  _addBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (!breakpointMap) {
      breakpointMap = new PerFileBreakpointMap(bp.filePath);
      this._breakpointMaps.set(bp.filePath, breakpointMap);
    }
    breakpointMap.addBreakpoint(bp.line, bp.column);
  }

  getBreakpoint(filePath: string, lineNum: number, columnNum: number = 0): void | Breakpoint {
    let breakpointMap = this._breakpointMaps.get(filePath);
    if (breakpointMap) return breakpointMap.getBreakpoint(lineNum, columnNum);
    return undefined;
  }

  removeBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._removeBreakpoint.bind(this));
  }

  _removeBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.removeBreakpoint(bp.line, bp.column);
  }

  enableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._enableBreakpoint.bind(this));
  }

  _enableBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.enableBreakpoint(bp.line, bp.column);
  }

  disableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._disableBreakpoint.bind(this));
  }

  _disableBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.disableBreakpoint(bp.line, bp.column);
  }

  _doBreakpointsAction(breakpoints: Array<BreakpointType>, action: BreakpointType => void) {
    for (let bp of breakpoints) {
      action(bp);
    }
  }
}
