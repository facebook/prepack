// abstract effects
var __evaluatePureFunction = this.__evaluatePureFunction || (f => f());
var obj = global.__abstract && global.__makePartial && global.__makeSimple ? __makeSimple(__makePartial(__abstract({}, "({foo:1})"))) : {foo:1};

var copyOfObj;
__evaluatePureFunction(() => {
  copyOfObj = Object.assign({}, obj);
});

inspect = function() {
  return JSON.stringify(copyOfObj);
}
