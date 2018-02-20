var React = require('react');
this['React'] = React;

function App(props) {
  var obj1 = Object.assign({}, props, {x: 20});
  var obj2 = Object.assign({}, obj1);
  return (
    <div>
      {obj1.x}
      {obj2.x}
    </div>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root x={10} />);
  return [['simple render with object assign', renderer.toJSON()]];
};

if (this.__registerReactComponentRoot) {
  __registerReactComponentRoot(App);
}

module.exports = App;