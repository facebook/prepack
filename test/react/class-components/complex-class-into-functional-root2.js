const React = require("react");
this['React'] = React;

function Child2(props) {
  return <span>{props.status}</span>;
}

class Child extends React.Component {
  constructor() {
    super();
    this.state = {
      status: null,
    };
  }
  componentWillReceiveProps() {
    this.setState({
      status: "componentWillReceiveProps"
    });
  }
  componentDidMount() {
    this.setState({
      status: "componentDidMount"
    });
  }
  render() {
    return (
      <div><Child2 {...this.state} /></div>
    );
  }
}

function App(props) {
  return <div><Child /></div>;
}

App.getTrials = function(renderer, Root) {
  let results = [];

  renderer.update(<Root />);
  results.push(['render complex class component into functional component', renderer.toJSON()]);

  return results;
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;