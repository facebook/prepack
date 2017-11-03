var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function Foo() {
  return <div>123</div>
}

function App(props: {yar: boolean}) {
	return <div>{props.yar ? <Foo arg={1} /> : <Foo arg={2} />}</div>;
}

App.getTrials = function(renderer, Root) {
	renderer.update(<Root />);
	let childKey = renderer.toTree().rendered.props.children.key
  return [['no added keys to child components', childKey]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;