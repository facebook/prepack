// throws introspection error

var b = global.__abstract ? __abstract("boolean", "true") : true;
var x = global.__abstract ? __abstract("number", "123") : 123;
var badOb = { valueOf: function() { throw 13;} }
var ob = global.__abstract ? __abstract("object", "({ valueOf: function() { throw 13;} })") : badOb;
var y = b ? ob : x;

try {
  z = -y;
} catch (err) {
  z = -err;
}

inspect = function() { return "" + z; }
