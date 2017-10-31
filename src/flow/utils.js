/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import traverse from "babel-traverse";
import { BabelNode } from "babel-types";
import * as t from "babel-types";

// taken directly from Babel:
// https://github.com/babel/babel/blob/master/packages/babel-plugin-transform-flow-strip-types/src/index.js
export function stripFlowTypeAnnotations(ast: BabelNode): void {
  traverse(
    ast,
    {
      ImportDeclaration(path) {
        if (!path.node.specifiers.length) return;
        let typeCount = 0;
        path.node.specifiers.forEach(({ importKind }) => {
          if (importKind === "type" || importKind === "typeof") {
            typeCount++;
          }
        });
        if (typeCount === path.node.specifiers.length) {
          path.remove();
        }
      },
      Flow(path) {
        path.remove();
      },
      ClassProperty(path) {
        path.node.variance = null;
        path.node.typeAnnotation = null;
        if (!path.node.value) path.remove();
      },
      Class(path) {
        path.node.implements = null;
        path.get("body.body").forEach(child => {
          if (child.isClassProperty()) {
            child.node.typeAnnotation = null;
            if (!child.node.value) child.remove();
          }
        });
      },
      AssignmentPattern({ node }) {
        node.left.optional = false;
      },
      Function({ node }) {
        for (let i = 0; i < node.params.length; i++) {
          const param = node.params[i];
          param.optional = false;
          if (param.type === "AssignmentPattern") {
            param.left.optional = false;
          }
        }
        node.predicate = null;
      },
      TypeCastExpression(path) {
        let { node } = path;
        do {
          node = node.expression;
        } while (t.isTypeCastExpression(node));
        path.replaceWith(node);
      },
    },
    undefined,
    (undefined: any),
    undefined
  );
}
