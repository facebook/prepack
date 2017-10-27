// es6
// delay unsupported requires

var modules = Object.create(null);

__d = define;
function require(moduleId) {
  var moduleIdReallyIsNumber = moduleId;
  var module = modules[moduleIdReallyIsNumber];
  return module && module.isInitialized ? module.exports : guardedLoadModule(moduleIdReallyIsNumber, module);
}

function define(factory, moduleId, dependencyMap) {
  if (moduleId in modules) {
    return;
  }
  modules[moduleId] = {
    dependencyMap: dependencyMap,
    exports: undefined,
    factory: factory,
    hasError: false,
    isInitialized: false
  };

  var _verboseName = arguments[3];
  if (_verboseName) {
    modules[moduleId].verboseName = _verboseName;
    verboseNamesToModuleIds[_verboseName] = moduleId;
  }
}

var inGuard = false;
function guardedLoadModule(moduleId, module) {
  if (!inGuard && global.ErrorUtils) {
    inGuard = true;
    var returnValue = void 0;
    try {
      returnValue = loadModuleImplementation(moduleId, module);
    } catch (e) {
      global.ErrorUtils.reportFatalError(e);
    }
    inGuard = false;
    return returnValue;
  } else {
    return loadModuleImplementation(moduleId, module);
  }
}

function loadModuleImplementation(moduleId, module) {
  var nativeRequire = global.nativeRequire;
  if (!module && nativeRequire) {
    nativeRequire(moduleId);
    module = modules[moduleId];
  }

  if (!module) {
    throw unknownModuleError(moduleId);
  }

  if (module.hasError) {
    throw moduleThrewError(moduleId);
  }

  module.isInitialized = true;
  var exports = module.exports = {};
  var _module = module,
      factory = _module.factory,
      dependencyMap = _module.dependencyMap;
      try {

   var _moduleObject = { exports: exports };

   factory(global, require, _moduleObject, exports, dependencyMap);

      module.factory = undefined;

   return module.exports = _moduleObject.exports;
 } catch (e) {
   module.hasError = true;
   module.isInitialized = false;
   module.exports = undefined;
   throw e;
 }
}

function unknownModuleError(id) {
  var message = 'Requiring unknown module "' + id + '".';
  return Error(message);
}

function moduleThrewError(id) {
  return Error('Requiring module "' + id + '", which threw an exception.');
}

// === End require code ===

define(function(global, require, module, exports) {
  let condition = global.__abstract ? __abstract("boolean", "true") : true;
  let obj1 = global.__abstract ? __abstract("object", "({ foo: 5 })") : { foo: 5 };
  let obj2 = global.__abstract ? __abstract("object", "({ foo: 8 })") : { foo: 8 };
  module.exports = condition ? obj1 : obj2;
}, 0, null);

define(function(global, require, module, exports) {
  //let condition = global.__abstract ? __abstract("boolean", "true") : true;
  let topNum = global.__abstract ? __abstract("number", "5") : 5;
  module.exports = topNum;
}, 4, null);

define(function(global, require, module, exports) {
  var x = require(0);
  module.exports = function() { return x; }
}, 1, null);


define(function(global, require, module, exports) {
  module.exports = { foo: 5 };
}, 2, null);

var f = require(1);

inspect = function() { return f().magic + require(1).foo; }
