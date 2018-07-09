// Copies of _\$B:2
// inline expressions

// _$B is the variable for Object.assign. See DeadObjectAssign4.js for
// a larger explanation.

function f(foo, bar) {
  var a = Object.assign({}, foo, bar, {a: 1});
  foo = {};
  var b = Object.assign({}, a, {a: 2});
  bar = {};
  var c = Object.assign({}, b, {a: 2}, {d: 5});
  return c;
}

if (global.__optimize) __optimize(f);

global.inspect = function() { return JSON.stringify(f({b: 1}, {c: 2})); }
