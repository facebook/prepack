// does not contain: "no"
let s = global.__abstract ? __abstract("string", "('s')") : 's';

if (s ? "t" : "") {
  y = s ? "yes" : "no";
}

inspect = function() { return y + " " + z; }
