// throws introspection error

var b = global.__abstract ? __abstract("boolean", "true") : true;
var x = global.__abstract ? __abstract("number", "123") : 123;
badOb = { valueOf: function() { throw 13;} }
var ob = global.__abstract ? __abstract("object", "badOb") : badOb;
var y = b ? ob : x;

try{
  y++;
} catch (err) {
  y = 1234;
}
z = y;

inspect = function() { return '' + z; }
