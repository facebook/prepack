var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function SubChild(props) {
  return <span>{props.title}</span>;
}

function Child(props) {
  return <span><SubChild title={props.title} /></span>;
}

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      title: "It works!",
    };
  }
  render() {
    return <Child title={this.state.title} />;
  }
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render with class root and props', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
