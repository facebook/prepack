// react
// babel:jsx

const Container = {
  MyComponent,
};

function createElement(type, options, ...children) {
  let key = null;
  let ref = null;

  if (options != null) {
    if (options.key !== undefined) {
      key = options.key;
      delete options.key;
    }
    if (options.ref !== undefined) {
      ref = options.ref;
      delete options.ref;
    }
  }
  let props = Object.assign({}, options);
  if (children !== undefined) {
    if (children.length === 1) {
      props.children = children[0];
    } else {
      props.children = children;
    }
  }
  return {
    $$typeof: Symbol.for('react.element'),
    props,
    key,
    ref,
    type,
    _owner: undefined,
  }
}

global.React = {
  createElement,
};

function MyComponent(props) {
  return <span>Title: {props.title}, Number: {props.number}</span>;
}

let props = {
  title: "Hello world",
  number: 50,
};

global.reactElement = (
  <div>
    <MyComponent {...props}>Hello world</MyComponent>
  </div>
);

inspect = function() { return reactElement; }
