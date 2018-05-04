var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

let lazyVariable = null;

if (!this.__sideEffect) {
  __sideEffect = x => x();
}

function A(props) {
  __sideEffect(function() {
    if (!lazyVariable) {
      lazyVariable = 123;
    }
  });
  return <div>Hello {lazyVariable}</div>;
}

function App() {
  return (
    <div>
      <A />
      <A />
      <A />
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple render', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;