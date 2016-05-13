
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

export function CopyBytes(length,
                          srcBuffer, srcOffset,
                          dstBuffer, dstOffset = 0) {
  /*
  const srcView = new Uint8Array(srcBuffer, srcOffset, length);
  const dstView = new Uint8Array(dstBuffer, dstOffset, length);
  var i = length - 1;
  while (i > -1) {
    dstView[i] = srcView[i];
    i--;
  }
  */
  new Uint8Array(dstBuffer).set(new Uint8Array(srcBuffer, srcOffset, length), dstOffset);
}
