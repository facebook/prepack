// This file was procedurally generated from the following sources:
// - src/declarations/redeclare-with-async-function-declaration.case
// - src/declarations/redeclare/switch-attempt-to-redeclare-const-declaration.template
/*---
description: redeclaration with AsyncFunctionDeclaration (LexicalDeclaration (const) in SwitchStatement)
esid: sec-switch-statement-static-semantics-early-errors
flags: [generated, async-functions]
negative:
  phase: early
  type: SyntaxError
info: |
    SwitchStatement : switch ( Expression ) CaseBlock

    It is a Syntax Error if the LexicallyDeclaredNames of CaseBlock contains any
    duplicate entries.

---*/


switch (0) { case 1: const f = 0; default: async function f() {} }
