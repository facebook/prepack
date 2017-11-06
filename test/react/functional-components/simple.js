var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function A(props) {
  return <div>Hello {props.x}</div>;
}

function B() {
  return <div>World</div>;
}

function C() {
  return "!";
}

function App() {
  return (
    <div>
      <A x={42} />
      <B />
      <C />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple render', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;