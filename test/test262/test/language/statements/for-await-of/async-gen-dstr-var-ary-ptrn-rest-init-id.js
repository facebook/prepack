// This file was procedurally generated from the following sources:
// - src/dstr-binding/ary-ptrn-rest-init-id.case
// - src/dstr-binding/default/for-await-of-async-gen-var.template
/*---
description: Reset element (identifier) does not support initializer (for-await-of statement)
esid: sec-for-in-and-for-of-statements-runtime-semantics-labelledevaluation
features: [destructuring-binding, async-iteration]
flags: [generated, async]
negative:
  phase: early
  type: SyntaxError
info: |
    IterationStatement :
        for await ( var ForBinding of AssignmentExpression ) Statement

    [...]
    2. Return ? ForIn/OfBodyEvaluation(ForBinding, Statement, keyResult,
        varBinding, labelSet, async).

    13.7.5.13 Runtime Semantics: ForIn/OfBodyEvaluation

    [...]
    3. Let destructuring be IsDestructuring of lhs.
    [...]
    5. Repeat
       [...]
       h. If destructuring is false, then
          [...]
       i. Else
          i. If lhsKind is assignment, then
             [...]
          ii. Else if lhsKind is varBinding, then
              1. Assert: lhs is a ForBinding.
              2. Let status be the result of performing BindingInitialization
                 for lhs passing nextValue and undefined as the arguments.
          [...]

    13.3.3 Destructuring Binding Patterns
    ArrayBindingPattern[Yield] :
        [ Elisionopt BindingRestElement[?Yield]opt ]
        [ BindingElementList[?Yield] ]
        [ BindingElementList[?Yield] , Elisionopt BindingRestElement[?Yield]opt ]
---*/

var iterCount = 0;

async function *fn() {
  for await (var [...x = []] of [[]]) {
    

    iterCount += 1;
  }
}

fn().next()
  .then(() => assert.sameValue(iterCount, 1, 'iteration occurred as expected'), $DONE)
  .then($DONE, $DONE);

