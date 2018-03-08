var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;
var {QueryRenderer} = require('RelayModern');
// this is needed otherwise QueryRenderer gets inlined
this['QueryRenderer'] = QueryRenderer;

class SomeClassThatShouldNotMakeRootAClass extends React.Component {
  constructor() {
    super();
    this.state = {
      foo : 1,
    };
  }
  render() {
    return <span>{this.state.foo}</span>;
  }
}

function App(props) {
  return (
    <QueryRenderer
      render={({error, _props}) => {
        return <SomeClassThatShouldNotMakeRootAClass />;
      }}
    />
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render props relay', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;