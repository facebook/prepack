// throws introspection error

let x = global.__abstract ? __abstract("number", "(3)") : 3;
let ob =  { valueOf: () => x };
let y = 123 / ob;
inspect = function() { return y; }
