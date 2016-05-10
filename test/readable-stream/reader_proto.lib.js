import {test as tapeTest} from '../common';

// Reader methods and properties.
const methods = ['constructor', 'cancel', 'read', 'releaseLock'];
const properties = ['closed'].concat(methods);

export default function (reader, test = tapeTest, isBYOB = false) {
  const proto = Object.getPrototypeOf(reader);
  const readerType = (isBYOB === true ? 'BYOB' : 'Default');
  
  test(test.parentName + `ReadableStream${readerType}Reader prototype`, function (assert) {
    const _properties = Object.getOwnPropertyNames(proto).sort();
    assert.plan(1 + (methods.length * 4) + 5 + 3 + 1);
    
    assert.deepEqual(_properties, properties.sort(), 'must have all correct methods and properties');
    
    methods.forEach((m) => {
      const propDesc = Object.getOwnPropertyDescriptor(proto, m);
      assert.equal(propDesc.enumerable, false, `[${m}] is not enumerable`);
      assert.equal(propDesc.configurable, true, `[${m}] is configurable`);
      assert.equal(propDesc.writable, true, `[${m}] is writable`);
      assert.equal(typeof proto[m], 'function', `[${m}] is a function`);
    });
  
    (function () {
      const closedPropDesc = Object.getOwnPropertyDescriptor(proto, 'closed');
      assert.equal(closedPropDesc.enumerable, false, '[closed] is not enumerable');
      assert.equal(closedPropDesc.configurable, true, '[closed] is configurable');
      assert.equal(-1, Object.getOwnPropertyNames(closedPropDesc).indexOf('writable'), '[closed] is not a data property');
      assert.equal(typeof closedPropDesc.get, 'function', '[closed] getter is a function');
      assert.equal(typeof closedPropDesc.set, 'undefined', '[closed] setter is undefined');
    })();

    assert.equal(proto.constructor.length, 1, '[constructor] expects 1 argument');
    assert.equal(proto.cancel.length, 1, '[cancel] method expects 1 argument');
    assert.equal(proto.releaseLock.length, 0, '[releaseLock] method expects no arguments');
    
    if(isBYOB !== true) {
      assert.equal(proto.read.length, 0, '[read] method expects no arguments');
    } else {
      assert.equal(proto.read.length, 1, '[read] method expects 1 argument');
    }
    
  });
  
  return proto;
}
