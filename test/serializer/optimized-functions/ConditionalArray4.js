function fn(a, b)  {
  var array = (a === null ? Array.from(b) : [4,5,6]);

  return array.reverse().join("-");
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify({
    a: fn(null, [1,2,3]),
    b: fn(true, [1,2,3]),
  });
}