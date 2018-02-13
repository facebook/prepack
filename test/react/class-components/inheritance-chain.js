const React = require("react");
this['React'] = React;

class Parent extends React.Component {
  constructor() {
    super();
    this.state ={
      a: 100,
    };
  }
  render() {
    if (this.props.x === 5) {
      return <span>{this.state.a}</span>;
    } else {
      return <span>Hello world</span>;
    }
  }
}

this['Parent'] = Parent;

class Child extends Parent {
  constructor() {
    super();
  }
}

class App extends React.Component {
  render() {
    return <div><Child x={10} /></div>;
  }
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['inheritance chain', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;