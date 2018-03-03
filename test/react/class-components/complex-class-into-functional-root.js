const React = require("react");
this['React'] = React;

class Child extends React.Component {
  constructor() {
    super();
    this.handleClick = this.handleClick.bind(this);
  }
  handleClick() {
    // works
  }
  render() {
    return <div onClick={this.handleClick}>Numbers: {this.props.x} {this.props.y}</div>;
  }
}

function App(props) {
  return <div><Child x={10} y={props.y} /></div>;
}

App.getTrials = function(renderer, Root) {
  let results = [];

  renderer.update(<Root y={20} />);
  results.push(['render complex class component into functional component', renderer.toJSON()]);
  renderer.update(<Root y={40} />);
  results.push(['update complex class component into functional component', renderer.toJSON()]);

  return results;
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;