// additional functions
// add at runtime:global.obj1 = { "extends": Math.random(), b: 10 }; global.obj2 = { "while": Math.random(), b: 10 };

let obj1 = global.__abstract ? __abstract({}, 'obj1') : { "extends": Math.random(), b: 10 };
let obj2 = global.__abstract ? __abstract({}, 'obj2') : { "while": Math.random(), b: 10 };

if (global.__makePartial) {
  __makePartial(obj1);
  __makePartial(obj2);
}
if (global.__makeSimple) {
  __makeSimple(obj1);
  __makeSimple(obj2);
}

function additional1() {
  obj1.c = 10;
  delete obj1['extends'];
  return obj1;
}

function additional2() {
  obj2.c = 5;
  delete obj2['while'];
  return obj2;
}

inspect = function() {
  let ret1 = additional1();
  let ret2 = additional2();
  let result = 0;
  for (let key in ret1) {
    result += ret1[key];
    result += ret2[key];
  }
  result += ret1.b;
  result += ret2.b;
  return result;
}
