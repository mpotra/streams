import ReadableStream from '../src/ReadableStream';
import tape from 'tape';
import tape_promise from 'tape-promise';

tape.Test.prototype.resolves = function (promise, ...args) {
  const self = this;
  const msg = (args.length && typeof args[args.length - 1] === 'string' ? args[args.length - 1] : 'promise resolves');
  
  return Promise.resolve().then(() => {
    promise.then(function (val) {
      if (args.length >= 2) {
        self.equal(val, ...args);
      } else {
        self.pass(...args);
      }
    }, function (err) {
      self.doesNotThrow(() => { throw err }, msg);
    }.bind(self))
  });
}

tape.Test.prototype.resolvesWith = function (promise, ...args) {
  const self = this;
  const msg = (args.length && typeof args[args.length - 1] === 'string' ? args[args.length - 1] : 'promise resolves');
  
  return Promise.resolve().then(() => {
    promise.then(function (val) {
      self.equal(val, ...args);
    }, function (err) {
      self.doesNotThrow(() => { throw err }, msg);
    }.bind(self))
  });
}

tape.Test.prototype.rejects = function (promise, ...args) {
  const self = this;
  const msg = (args.length && typeof args[args.length - 1] === 'string' ? args[args.length - 1] : 'promise rejects');
  
  return Promise.resolve().then(() => {
    promise.then(function (val) {
      self.fail(msg);
    }, function (err) {
      self.throws(() => { throw err }, ...args);
    }.bind(self))
  });
}

const test = tape;
const test_promise = tape_promise(tape);

export {ReadableStream, test, test_promise};

export function subtest(assert) {
  const _test = assert.test;
  _test.parentName = assert.name + ' -> ';
  return _test;
}