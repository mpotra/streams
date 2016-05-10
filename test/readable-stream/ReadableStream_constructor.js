import {ReadableStream, test} from '../common';

test('ReadableStream constructor', function(assert) {
  let varUndef;
  assert.plan(14);
  assert.doesNotThrow(() => new ReadableStream(), 'works without parameters');
  assert.equal((new ReadableStream()).constructor.length, 0, 'has defaults for all parameters');
  assert.doesNotThrow(() => new ReadableStream({}), 'works with empty object source = {} parameter');
  assert.doesNotThrow(() => new ReadableStream({type: undefined}), 'works with undefined source = {type: undefined}');
  assert.doesNotThrow(() => new ReadableStream(undefined), 'works with undefined parameter');
  assert.doesNotThrow(() => new ReadableStream(varUndef), 'works with undefined variable as parameter');
  assert.throws(() => new ReadableStream(null), TypeError, 'throws with null parameter');
  assert.throws(() => new ReadableStream({type:null}), RangeError, 'throws with source = {type: null} parameter');
  assert.throws(() => new ReadableStream({type: ''}), RangeError, 'throws with source = {type: ""} parameter');
  assert.throws(() => new ReadableStream({type: 'asdf'}), RangeError, 'throws with source = {type: "asdf"} parameter');
  assert.doesNotThrow(() => new ReadableStream({type: 'bytes'}), 'works with source = {type: "bytes"} parameter');
  assert.throws(() => new ReadableStream({start: 'banana'}), TypeError, 'throws with invalid source.start (not a function) parameter');
  assert.doesNotThrow(() => new ReadableStream({cancel: '2'}), 'allows invalid source.cancel (not a function) parameter');
  assert.doesNotThrow(() => new ReadableStream({pull: '2'}), 'allows invalid source.pull (not a function) parameter');
});