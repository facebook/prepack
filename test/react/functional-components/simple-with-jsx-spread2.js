var React = require('react');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

function IWantThisToBeInlined(props) {
  return <div>{props.text} {props.name} {props.id}</div>
}

function Button(props) {
  return props.switch ? <IWantThisToBeInlined {...props} /> : null
}

Button.defaultProps = {
	name: "Dominic",
};

function App(props) {
  return <Button {...props} id={"5"} switch={true} />
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root text={"Hello world"} id="6" switch={false} />);
  return [['simple render with jsx spread 2', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;