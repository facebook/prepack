// recover-from-errors
// expected errors: [{"location":{"start":{"line":11,"column":13},"end":{"line":11,"column":18},"source":"test/error-handler/write-write-conflict.js"},"severity":"FatalError","errorCode":"PP1003"},{"location":{"start":{"line":7,"column":13},"end":{"line":7,"column":18},"source":"test/error-handler/write-write-conflict.js"},"severity":"FatalError","errorCode":"PP1003"}]

global.a = "";

function additional1() {
  global.a = "foo";
}

function additional2() {
  global.a = "bar";
}

if (global.__optimize) {
  __optimize(additional1);
  __optimize(additional2);
}

inspect = function() {
  additional2();
  additional1();
  return global.a;
}
