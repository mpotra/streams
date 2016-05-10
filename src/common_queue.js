import assert from 'assert';

export function DequeueValue(q) {
  assert(q.length > 0, 'queue must not be empty');
  // const pair = q.shift();
  // return pair.value;
  return q.shift().value;
}

export function EnqueueValueWithSize(q, value, sz) {
  const size = Number(sz);
  if (false === Number.isFinite(size) || size < 0) {
    throw new RangeError('Invalid size');
  }
  q.push({value, size});
}

export function GetTotalQueueSize(q) {
  return q.reduce((previous, current) => {
    assert(Number.isFinite(current.size), 'size must be a finite number');
    return previous + current.size;
  }, 0);
}

export function PeekQueueValue(q) {
  assert(q.length > 0, 'queue must not be empty');
  return q[0].value;
}
