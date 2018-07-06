// Copies of _5:2
// _5 is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(o) {
  var p = Object.assign({}, o, {a: 1});
  var p2 = Object.assign({}, o, {a: 2});
  var q = Object.assign({}, p, {a: 3});
  var q2 = Object.assign({}, q, {a: 4});
  return q2;
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return JSON.stringify(f({a: 10})); }
