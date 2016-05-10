import {ReadableStream, test, test_promise} from '../common';

test('ReadableStream [cancel()]', function (assert) {
  let cancelPromise;
  const rs = new ReadableStream();
  
  assert.plan(4);

  assert.doesNotThrow(() => (new ReadableStream()).cancel(), 'does not throw when stream has initial ("readable") state');

  cancelPromise = (new ReadableStream()).cancel();
  assert.equal(typeof cancelPromise.then, 'function', 'returns a Promise');

  cancelPromise = (new ReadableStream()).cancel();
  assert.resolves(cancelPromise, undefined, 'returns a promise that resolves with undefined');
  
  rs.getReader();
  assert.rejects(() => rs.cancel(), TypeError, 'rejects with TypeError for a locked ReadableStream');
});
