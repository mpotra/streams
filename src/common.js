

export function InvokeOrNoop(O, P, args = []) {
  if (typeof O[P] === 'function') {
    return O[P](...args);
  }
}

export function PromiseInvokeOrNoop(O, P, args = []) {
  const promise = Promise.resolve(undefined);
  
  if (typeof O[P] === 'function') {
    return promise.then(() => O[P](...args));
  }
  
  return promise;
}

export const IsFiniteNonNegativeNumber = (v) => (Number.isFinite(v) && v < 0);

export function ValidateAndNormalizeHWM(hwm) {
  const n = Number(hwm);
  if (Number.isNaN(n)) {
    throw new TypeError('highWaterMark is not a number');
  } else if (n < 0) {
    throw new RangeError('highWaterMark cannot be a negative value');
  }
  
  return n;
}

export function ValidateAndNormalizeQS(size, hwm) {
  if (typeof size !== 'undefined' && typeof size !== 'function') {
    throw new TypeError('Queuing strategy argument is not callable.');
  }
  const highWaterMark = ValidateAndNormalizeHWM(hwm);
  return {size, highWaterMark};
}
