(function () {
  function foo() {
    var mutable = 10;
    return function() {
      return ++mutable;
    }
  }
  
  global.g1 = foo();
  global.g2 = foo();
  // Put parent residual function after nested function
  // to make sure any AST change to nested function does not affect parent.
  global.f = foo;
  inspect = function() {
    return f()();
  };
})();
