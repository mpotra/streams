import {ReadableStream, test as tapeTest} from '../common';

import testProto from './reader_proto.lib.js';

export {testProto};

export function testConstructor(reader, test = tapeTest) {
  const proto = Object.getPrototypeOf(reader);
  const ctor = proto.constructor;
  
  test(test.parentName + 'ReadableStreamDefaultReader [constructor]', function(assert) {
    let rs = new ReadableStream();
    
    assert.plan(6);
    
    assert.doesNotThrow(() => new ctor(rs), 'works for a ReadableStream argument');
    assert.throws(() => new ctor(), TypeError, 'throws for no argument');
    assert.throws(() => new ctor(undefined), TypeError, 'throws for undefined argument');
    assert.throws(() => new ctor(1), TypeError, 'throws for a numeric argument');
    assert.throws(() => new ctor({banana: 'yellow'}), TypeError, 'thtows for an object that is not a ReadableStream');
    
    rs = new ReadableStream();
    rs.getReader();
    assert.throws(() => new ctor(rs), TypeError, 'throws for a locked stream');
  });
  
  return ctor;
}
