y = global.__abstract ? __abstract("object", "({})") : {};
let z = !y;
if (global.__isAbstract && __isAbstract(z)) throw new Error("bug!");
x = z;
inspect = function() { return x; }
