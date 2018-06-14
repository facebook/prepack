var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function App() {
  return (
    <div>
      {
        React.createElement("div")
      }
      {
        React.createElement("div", undefined)
      }
      {
        React.createElement("div", null)
      }
    </div>
  )
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['null or undefined props', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;
