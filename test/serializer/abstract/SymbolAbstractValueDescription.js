var someNumber = 5
var someString = "hello"
var abstractNumber = global.__abstract ? __abstract("number", "someNumber") : 5;
var abstractString = global.__abstract ? __abstract("string", "someString"): "hello";
x = Symbol(abstractNumber);
y = Symbol(abstractString);
inspect = function () { return y.toString() + x.toString()}
