let x = global.__abstract ? __abstract("number", "(3)") : 3;
let ob =  { valueOf: () => x };
let y = ob <= 'abc';
inspect = function() { return y; }
