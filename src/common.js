

export function InvokeOrNoop(O, P, args = []) {
  if (typeof O[P] !== 'undefined') {
    return O[P](...args);
  }
}

export function PromiseInvokeOrNoop(O, P, args) {
  let method;
  try {
    method = O[P];
  } catch (methodE) {
    return Promise.reject(methodE);
  }

  if (method === undefined) {
    return Promise.resolve(undefined);
  }

  try {
    return Promise.resolve(method.apply(O, args));
  } catch (e) {
    return Promise.reject(e);
  }
}

//export const IsFiniteNonNegativeNumber = (v) => (Number.isFinite(v) && v < 0);
export function IsFiniteNonNegativeNumber(v) {
  if (Number.isNaN(v)) {
    return false;
  }
  if (v === +Infinity) {
    return false;
  }
  if (v < 0) {
    return false;
  }

  return true;
}

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
