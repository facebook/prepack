var React = require('React');
// the JSX transform converts to React, so we need to add it back in
this['React'] = React;

var Ctx = React.createContext(null);

function Child(props) {
  return (
    <div>
      <Ctx.Consumer>
        {value => {
          return <span>{value}</span>
        }}
      </Ctx.Consumer>
    </div>
  )
}

function App(props) {
  return (
    <Ctx.Provider value="a">
      <Ctx.Provider value="b">
        <Child />
      </Ctx.Provider>
      <Child />
    </Ctx.Provider>
  );
}

App.getTrials = function(renderer, Root) {
  renderer.update(<Root />);
  return [['render props context', renderer.toJSON()]];
};

if (this.__optimizeReactComponentTree) {
  __optimizeReactComponentTree(App);
}

module.exports = App;