var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

class Child extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      title: "It works!",
    };
  }
  render() {
    return <div>{this.state.title}</div>;
  }
}

function App() {
  return <Child />
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple render 4', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
