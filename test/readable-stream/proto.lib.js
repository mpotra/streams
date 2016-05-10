import {test as tapeTest} from '../common';

// ReadableStream methods and properties.
const methods = ['cancel', 'constructor', 'getReader', 'pipeThrough', 'pipeTo', 'tee'];
const properties = ['locked'].concat(methods);

export default function (stream, test = tapeTest) {
  const proto = Object.getPrototypeOf(stream);
  
  test('ReadableStream prototype must have all correct methods and properties', function(assert) {
    const _properties = Object.getOwnPropertyNames(proto).sort();
    
    assert.plan(1 + methods.length * 4 + 5);
    assert.deepEqual(_properties, properties.sort(), 'contains all properties');
    
    methods.forEach((m) => {
      const propDesc = Object.getOwnPropertyDescriptor(proto, m);
      assert.equal(propDesc.enumerable, false, `[${m}] is not enumerable`);
      assert.equal(propDesc.configurable, true, `[${m}] is configurable`);
      assert.equal(propDesc.writable, true, `[${m}] is writable`);
      assert.equal(typeof proto[m], 'function', `[${m}] is a function`);
    });
    
    const propDesc = Object.getOwnPropertyDescriptor(proto, 'locked');
    assert.equal(propDesc.enumerable, false, '[locked] is not enumerable');
    assert.equal(propDesc.configurable, true, '[locked] is configurable');
    assert.equal(-1, Object.getOwnPropertyNames(propDesc).indexOf('writable'), '[locked] is not a data property');
    assert.equal(typeof propDesc.get, 'function', '[locked] getter is a function');
    assert.equal(typeof propDesc.set, 'undefined', '[locked] setter is undefined');
  });

  test('ReadableStream prototype methods expected arguments', function(assert) {
    const ctor = proto.constructor;
    assert.plan(6);
    assert.equal(ctor.length, 0, '[constructor] expects no arguments');
    assert.equal(proto.cancel.length, 1, '[cancel] expects 1 argument');
    assert.equal(proto.getReader.length, 0, '[getReader] expects no arguments');
    assert.equal(proto.pipeThrough.length, 2, '[pipeThrough] expects 2 arguments');
    assert.equal(proto.pipeTo.length, 1, '[pipeTo] expects 1 argument');
    assert.equal(proto.tee.length, 0, '[tee] expects no arguments');
  });
}
