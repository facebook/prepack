var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function SubChild() {
  return <span>Hello world</span>;
}

function Child() {
  return <span><SubChild /></span>;
}

// we can't use ES2015 classes in Prepack yet (they don't serialize)
// so we have to use ES5 instead
var App = (function (superclass) {
  function App () {
    superclass.apply(this, arguments);
  }

  if ( superclass ) {
    App.__proto__ = superclass;
  }
  App.prototype = Object.create( superclass && superclass.prototype );
  App.prototype.constructor = App;
  App.prototype.render = function render () {
    return <Child />;
  };
  App.getTrials = function(renderer, Root) {
    renderer.update(<Root />);
    return [['render with class root', renderer.toJSON()]];
  };

  return App;
}(React.Component));

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
