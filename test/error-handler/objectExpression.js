// recover-from-errors
// expected errors: [{"location":{"start":{"line":7,"column":11},"end":{"line":7,"column":30},"source":"test/error-handler/objectExpression.js"},"severity":"FatalError","errorCode":"PP0011"}, {"location":{"start":{"line":7,"column":32},"end":{"line":7,"column":38},"source":"test/error-handler/objectExpression.js"},"severity":"FatalError","errorCode":"PP0011"}]

let x = __abstract("number");
let y = __abstract("number");

let ob = { [x]: function () {}, [y]: 2 };
