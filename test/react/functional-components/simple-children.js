var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function A(props) {
	return props.children;
}

function App(props: any) {
  return (
    <A>
      <A>
        Hi
      </A>
    </A>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['simple children', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;
