import {ReadableStream, test, subtest} from '../common';
import * as ReadableStreamDefaultReader from './ReadableStreamDefaultReader';

test('ReadableStream [getReader()] with non-bytes source', function (assert) {

  assert.plan(7);

  assert.doesNotThrow(() => {
    const rs = new ReadableStream();
    rs.getReader();
  }, 'works with no parameters');
  
  assert.doesNotThrow(() => {
    const rs = new ReadableStream();
    rs.getReader(undefined);
  }, 'works with undefined parameter');
  
  assert.throws(() => {
    const rs = new ReadableStream();
    rs.getReader({mode: 'byob'});
  }, TypeError, 'throws when opts = {mode: "byob"}');
  
  assert.equal((function (rs) {
    rs.getReader();
    return rs.locked;
  })(new ReadableStream()), true, 'locks the ReadableStream');
  
  assert.throws(() => {
    const rs = new ReadableStream();
    rs.getReader();
    rs.getReader();
  }, TypeError, 'throws on an already locked stream');
  
  // subtests.
  (function (rs, test) {
    const reader = rs.getReader();
    ReadableStreamDefaultReader.testProto(reader, test);
    ReadableStreamDefaultReader.testConstructor(reader, test);
  })(new ReadableStream(), subtest(assert));
});

