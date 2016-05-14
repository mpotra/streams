import assert from 'assert';

export const isObject = (o) => (typeof o === 'object' && o !== null);

export function hasInternalSlot(o, slot) {
  return (Object.getOwnPropertySymbols(o).indexOf(slot) !== -1);
}

export function ensureAssertionThrows(e, silent = false) {
  if (isObject(e) && e.name === 'AssertionError') {
    setImmediate(() => {
      throw e;
    });
  } else if (silent === false) {
    throw e;
  }
}

export const CreateIterResultObject = (value, done) => ({value, done});

export function CreatePromiseHandle(promise, promiseResolve, promiseReject) {
  const handle = {};
  
  if (typeof promise === 'undefined') {
    handle.promise = new Promise((resolve, reject) => {
      handle.reject = reject;
      handle.resolve = resolve;
    });
  } else {
    handle.promise = promise;
    handle.resolve = promiseResolve || (() => {});
    handle.reject = promiseReject || (() => {});
  }
  
  assert('function' === typeof handle.resolve,
          'promise Resolve must be a function');
  assert('function' === typeof handle.reject,
          'promise Reject must be a function');
  
  return handle;
}

export function CopyDataBlockBytes(srcBuffer, srcOffset,
                                    dstBuffer, dstOffset, length) {
  /*
  const srcView = new Uint8Array(srcBuffer, srcOffset, length);
  const dstView = new Uint8Array(dstBuffer, dstOffset, length);
  var i = length - 1;
  while (i > -1) {
    dstView[i] = srcView[i];
    i--;
  }
  */
  new Uint8Array(dstBuffer).set(new Uint8Array(srcBuffer, srcOffset, length),
                                dstOffset);
}

// WARNING: THIS FUNCTION DOES NOT IMPLEMENT THE SPEC ACCURATELY.
// Spec: https://tc39.github.io/ecma262/#sec-clonearraybuffer
export function CloneArrayBuffer(srcBuffer,
                                  srcOffset, srcLength,
                                  cloneConstructor) {
  assert(typeof srcBuffer === 'object', 'srcBuffer must be an object');
  assert(srcBuffer instanceof ArrayBuffer,
    'srcBuffer must have [[ArrayBufferData]] internal slot');
  
  if (typeof cloneConstructor === 'undefined') {
    cloneConstructor = ArrayBuffer;
  } else {
    assert(typeof cloneConstructor === 'function',
      'IsConstructor(cloneConstructor) is true');
  }
  
  // same as: targetBuffer = AllocateArrayBuffer(cloneConstructor, srcLength);
  const targetBuffer = new ArrayBuffer(srcLength);
  
  const targetView = new Uint8Array(targetBuffer);
  const srcView = new Uint8Array(srcBuffer, srcOffset, srcLength);
  
  targetView.set(srcView, 0);
  
  return targetBuffer;
}
