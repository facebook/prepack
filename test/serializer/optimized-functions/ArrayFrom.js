function inner(props) {
  var foo = Array.from(props.foo);
  var bar = foo.filter(Boolean);

  bar[0];

  if (bar.length === 0) {
    return null;
  }

  return 42;
}

function fn(arg) {
  if (!arg.condition) {
    return null
  }
  return inner(arg)
}

if (global.__optimize) __optimize(fn);

inspect = function() {
  return JSON.stringify([
    fn({condition: false}),
    fn({condition: true, foo: []}),
    fn({condition: true, foo: [false]}),
    fn({condition: true, foo: [true]}),
    fn({condition: true, foo: [false, 5]}),
    fn({condition: true, foo: [true, 5]}),
  ])
};
