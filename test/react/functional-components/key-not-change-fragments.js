var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

// we can't use ES2015 classes in Prepack yet (they don't serialize)
// so we have to use ES5 instead
var Stateful = (function (superclass) {
  function Stateful () {
    superclass.apply(this, arguments);
    this.state = { updated: false };
  }

  if ( superclass ) {
    Stateful.__proto__ = superclass;
  }
  Stateful.prototype = Object.create( superclass && superclass.prototype );
  Stateful.prototype.constructor = Stateful;
  Stateful.prototype.componentWillReceiveProps = function componentWillReceiveProps() {
    this.setState({ updated: true });
  }
  Stateful.prototype.render = function render () {
    return (
      <div>
        {this.props.children}
        (is update: {String(this.state.updated)})
      </div>
    );
  };

  return Stateful;
}(React.Component));

function App(props) {
  if (props.switch) {
    return (
      <React.Fragment>
        <Stateful key='hi' x={props.x}>Hi</Stateful>
      </React.Fragment>
    );
  }
  return [
    <Stateful key='hi' x={props.x}>Bye</Stateful>
  ];
}

App.getTrials = function(renderer, Root) {
  let results = [];
  renderer.update(<Root switch={false} />);
  results.push(['mount', renderer.toJSON()]);

  renderer.update(<Root switch={false} />);
  results.push(['update with same array', renderer.toJSON()]);

  renderer.update(<Root switch={true} />);
  results.push(['update with different fragment', renderer.toJSON()]);

  renderer.update(<Root switch={true} />);
  results.push(['update with same fragment (again)', renderer.toJSON()]);

  renderer.update(<Root switch={false} />);
  results.push(['update with different array (again)', renderer.toJSON()]);
  return results;
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
