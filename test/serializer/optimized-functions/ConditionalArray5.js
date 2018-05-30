function fn(a, b)  {
  var array = (a === null ? Array.from(b) : [4,5,6]);

  array.push(0);
  array.reverse();
  array.unshift(10);
  array.push(1);
  array.pop();
  array.shift();
  array.splice(1, 0, 15);

  return array.filter(Boolean).join("-");
}

global.__optimize && __optimize(fn);

inspect = function() {
  return JSON.stringify({
    a: fn(null, [1,2,3]),
    b: fn(true, [1,2,3]),
  });
}