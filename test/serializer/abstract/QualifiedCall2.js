// add at runtime: global.bar = {x: 1};
let bar = global.__abstract ? __makeSimple(__abstract('object', 'bar')) : {x: 1};
let foo = global.__abstract ? __abstract('function', '(function() { return this.x; })') : function() { return this.x; };

bar.foo = foo;
x = bar.foo();
bar.foo = function() { return "abc"; }
y = bar.foo();

inspect = function() { return "" + x + y; }
