var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

var Child = (function (superclass) {
  function Child () {
    superclass.apply(this, arguments);
  }

  if ( superclass ) {
    Child.__proto__ = superclass;
  }
  Child.prototype = Object.create( superclass && superclass.prototype );
  Child.prototype.constructor = Child;
  Child.prototype.render = function render () {
    return <div>Hello world</div>;
  };

  return Child;
}(React.Component));

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
    return [['render simple classes', renderer.toJSON()]];
  };

  return App;
}(React.Component));

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
