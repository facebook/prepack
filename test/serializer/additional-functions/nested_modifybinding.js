// does not contain:var y = 5;
// does not contain:var y = 10;

(function () {
    let top = 5;
    function af1() {
        let mutable = 3;
        return function() {
            return (++mutable) + (--top);
        }
    };
    global.residual = function() {
        return ++top;
    };
    global.f = af1;
    if (global.__registerAdditionalFunctionToPrepack)
      global.__registerAdditionalFunctionToPrepack(af1);
    inspect = function() {
        return f()() + residual();
    }
})();
