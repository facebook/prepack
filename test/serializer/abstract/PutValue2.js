var obj = global.__makePartial ? __makePartial({ someProperty: 41 }) : {};
obj.someProperty = 42;
z = obj.someProperty;

inspect = function() { return "" + z; }
