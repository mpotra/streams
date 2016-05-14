import assert from 'assert';
import debug from 'debug';

import {isObject, hasInternalSlot,
        ensureAssertionThrows,
        CreatePromiseHandle}
        from './util';

import {InvokeOrNoop, PromiseInvokeOrNoop, PromiseInvokeOrFallbackOrNoop,
        ValidateAndNormalizeQS}
        from './common';
        
import {DequeueValue, GetTotalQueueSize, PeekQueueValue,
        EnqueueValueWithSize}
        from './common_queue';
        
const debug1 = debug('L1');
const debug2 = debug('L2');
//const debug3 = debug('L3');
const debug4 = debug('L4');
//const debug5 = debug('L5');


/*******************************************************************************
 *
 * WritableStream
 *
 ******************************************************************************/

// Define internal slot property names.
const __handleClosedPromise = Symbol('handleClosedPromise');
const __closedPromise = Symbol('closedPromise');
const __queue = Symbol('queue');
const __started = Symbol('started');
const __startedPromise = Symbol('startedPromise');
const __state = Symbol('state');
const __storedError = Symbol('storedError');
const __strategySize = Symbol('strategySize');
const __strategyHWM = Symbol('strategyHWM');
const __handleReadyPromise = Symbol('handleReadyPromise');
const __readyPromise = Symbol('readyPromise');
const __underlyingSink = Symbol('underlyingSink');
const __writing = Symbol('writing');

export default class WritableStream {
  constructor(underlyingSink = {}, { size, highWaterMark = 0 } = {}) {
    this[__underlyingSink] = underlyingSink;
    this[__handleClosedPromise] = CreatePromiseHandle();
    this[__closedPromise] = this[__handleClosedPromise].promise;
    this[__handleReadyPromise] = {
      'promise': Promise.resolve(undefined),
      resolve() {},
      reject() {}
    };
    this[__readyPromise] = this[__handleReadyPromise].promise;
    this[__queue] = [];
    this[__state] = 'writable';
    this[__started] = false;
    this[__writing] = false;
    
    const strategy = ValidateAndNormalizeQS(size, highWaterMark);
    this[__strategySize] = strategy.size;
    this[__strategyHWM] = strategy.highWaterMark;
    
    SyncWritableStreamStateWithQueue(this);
    
    const fnError = (e) => ErrorWritableStream(this, e);
    const startResult = InvokeOrNoop(underlyingSink, 'start', [fnError]);
    const startPromise = this[__startedPromise] = Promise.resolve(startResult);
    
    startPromise.then(() => {
      // Upon fulfillment.
      this[__started] = true;
      this[__startedPromise] = undefined;
    }, (r) => ErrorWritableStream(this, r))
    .catch(ensureAssertionThrows);
    
  }

  get closed() {
    if (IsWritableStream(this) === false) {
      return Promise.reject(new TypeError('Not a writable stream'));
    }
    
    return this[__closedPromise];
  }
  
  get ready() {
    if (IsWritableStream(this) === false) {
      return Promise.reject(new TypeError('Not a writable stream'));
    }
    
    return this[__readyPromise];
  }
  
  get state() {
    if (IsWritableStream(this) === false) {
      throw new TypeError('Not a writable stream');
    }
    
    return this[__state];
  }

  abort(reason) {
    debug1('WritableStream::abort()');
    
    if (IsWritableStream(this) === false) {
      return Promise.reject(new TypeError('Not a writable stream'));
    }
    
    if (this[__state] === 'closed') {
      return Promise.reject(undefined);
    }
    
    if (this[__state] === 'errored') {
      return Promise.reject(this[__storedError]);
    }
    
    ErrorWritableStream(this, reason);
    
    const sinkAbortPromise =
      PromiseInvokeOrFallbackOrNoop(this[__underlyingSink],
                                    'abort', [reason],
                                    'close', []);
    
    return sinkAbortPromise.then(() => undefined);
  }
  
  close() {
    debug1('WritableStream::close()');
    
    if (IsWritableStream(this) === false) {
      return Promise.reject(new TypeError('Not a writable stream'));
    }
    
    const state = this[__state];
    
    if (state === 'closing' || state === 'closed') {
      return Promise.reject(new TypeError('Cannot close with state ' + state));
    } else if (state === 'errored') {
      return Promise.reject(this[__storedError]);
    } else if (state === 'waiting') {
      // Resolve this[__readyPromise] with undefined.
      this[__handleReadyPromise].resolve(undefined);
    }
    
    this[__state] = 'closing';
    
    EnqueueValueWithSize(this[__queue], 'close', 0);
    
    CallOrScheduleWritableStreamAdvanceQueue(this);
    
    return this[__closedPromise];
  }
  
  write(chunk) {
    debug1('WritableStream::write()');
    
    if (IsWritableStream(this) === false) {
      return Promise.reject(new TypeError('Not a writable stream'));
    }
    
    const state = this[__state];
    
    if (state === 'closing' || state === 'closed') {
      return Promise.reject(new TypeError('Cannot write with state ' + state));
    } else if (state === 'errored') {
      return Promise.reject(this[__storedError]);
    }
    
    assert(state === 'waiting' || state === 'writable',
      'state is waiting or writable');
    
    let chunkSize = 1;
    
    if (typeof this[__strategySize] !== 'undefined') {
      try {
        chunkSize = this[__strategySize].call(undefined, chunk);
      } catch (e) {
        ErrorWritableStream(this, e);
        return Promise.reject(e);
      }
    }
    
    const handlePromise = CreatePromiseHandle();
    const promise = handlePromise.promise;
    const writeRecord = {promise, chunk, handlePromise};
    
    try {
      EnqueueValueWithSize(this[__queue], writeRecord, chunkSize);
    } catch (e) {
      ErrorWritableStream(this, e);
      return Promise.reject(e);
    }
    
    SyncWritableStreamStateWithQueue(this);
    
    CallOrScheduleWritableStreamAdvanceQueue(this);
    
    return promise;
  }
}

function IsWritableStream(o) {
  return (isObject(o) && hasInternalSlot(o, __underlyingSink));
}

function CallOrScheduleWritableStreamAdvanceQueue(stream) {
  debug4('CallOrScheduleWritableStreamAdvanceQueue()');
  
  if (stream[__started] === false) {
    stream[__startedPromise].then(() => WritableStreamAdvanceQueue(stream))
                            .catch(ensureAssertionThrows);
    return undefined;
  } else {
    return WritableStreamAdvanceQueue(stream);
  }
}

function CloseWritableStream(stream) {
  debug2('CloseWritableStream()');
  
  assert(stream[__state] === 'closing',
    'Writable stream state must be closing');
  
  const sinkClosePromise =
    PromiseInvokeOrNoop(stream[__underlyingSink], 'close');
  
  sinkClosePromise.then(() => {
    if (stream[__state] === 'errored') {
      return;
    }
    
    assert(stream[__state] === 'closing', 'WritableStream must be closing');
    
    stream[__handleClosedPromise].resolve(undefined);
    stream[__state] = 'closed';
  }, (r) => ErrorWritableStream(stream, r))
  .catch(ensureAssertionThrows);
    
  return undefined;
}

function ErrorWritableStream(stream, e) {
  debug2('ErrorWritableStream()');
  
  if (stream[__state] === 'closed' || stream[__state] === 'errored') {
    return undefined;
  }
  
  while (stream[__queue].length > 0) {
    const writeRecord = DequeueValue(stream[__queue]);
    
    if (writeRecord !== 'close') {
      writeRecord.handlePromise.reject(e);
    }
  }
  
  stream[__storedError] = e;
  
  if (stream[__state] === 'waiting') {
    stream[__handleReadyPromise].resolve(undefined);
  }
  
  stream[__handleClosedPromise].reject(e);
  
  stream[__state] = 'errored';
  
  return undefined;
}

function SyncWritableStreamStateWithQueue(stream) {
  debug4('SyncWritableStreamStateWithQueue()');
  
  if (stream[__state] === 'closing') {
    return undefined;
  }
  
  assert(stream[__state] === 'writable' || stream[__state] === 'waiting',
    'writable stream state must be waiting or writable');
  
  const queueSize = GetTotalQueueSize(stream[__queue]);
  const shouldApplyBackpressure = (queueSize > stream[__strategyHWM]);
  
  if (shouldApplyBackpressure === true) {
    stream[__state] = 'waiting';
    stream[__handleReadyPromise] = CreatePromiseHandle();
    stream[__readyPromise] = stream[__handleReadyPromise].promise;
  } else if (stream[__state] === 'waiting') {
    stream[__state] = 'writable';
    stream[__handleReadyPromise].resolve(undefined);
  }
  
  return undefined;
}

function WritableStreamAdvanceQueue(stream) {
  debug4('WritableStreamAdvanceQueue()');
  
  if (stream[__queue].length <= 0 || stream[__writing] === true) {
    return undefined;
  }
  
  const writeRecord = PeekQueueValue(stream[__queue]);
  
  if (writeRecord === 'close') {
    assert(stream[__state] === 'closing', 'writable stream must be closing');
    DequeueValue(stream[__queue]);
    assert(stream[__queue].length === 0, 'stream queue should be empty');
    return CloseWritableStream(stream);
  }
  
  stream[__writing] = true;
  
  const writeResult =
    PromiseInvokeOrNoop(stream[__underlyingSink], 'write', [writeRecord.chunk]);
  
  writeResult.then(() => {
    if (stream[__state] === 'errored') {
      return;
    }
    
    stream[__writing] = false;
    
    writeRecord.handlePromise.resolve(undefined);
    
    DequeueValue(stream[__queue]);
    SyncWritableStreamStateWithQueue(stream);
    WritableStreamAdvanceQueue(stream);
  }, (r) => ErrorWritableStream(stream, r))
  .catch(ensureAssertionThrows);
    
  return undefined;
}
