import assert from 'assert';
import debug from 'debug';

import {isObject, hasInternalSlot,
        CreateIterResultObject, ensureAssertionThrows,
        CloneArrayBuffer, CopyDataBlockBytes,
        CreatePromiseHandle}
        from './util';

import {InvokeOrNoop, PromiseInvokeOrNoop,
        ValidateAndNormalizeQS, ValidateAndNormalizeHWM,
        IsFiniteNonNegativeNumber, SameRealmTransfer,
        CreateArrayFromList, StructuredClone}
        from './common';
        
import {DequeueValue, GetTotalQueueSize,
        EnqueueValueWithSize}
        from './common_queue';
        
const debug1 = debug('L1');
const debug2 = debug('L2');
const debug3 = debug('L3');
const debug4 = debug('L4');
const debug5 = debug('L5');

import createRSFixtures from './fixtures/readable-stream';

/*******************************************************************************
 *
 * ReadableStream
 *
 ******************************************************************************/

// Define internal slot property names.
const __readableStreamController = Symbol('readableStreamController');
const __disturbed = Symbol('disturbed');
const __reader = Symbol('reader');
const __state = Symbol('state');
const __storedError = Symbol('storedError');

function __ThrowIfNotReadableStream(stream) {
  if (IsReadableStream(stream) === false) {
    throw new TypeError('Not a readable stream');
  }
  return stream;
}

function __ThrowIfReadableStreamLocked(stream) {
  if (IsReadableStreamLocked(stream) === true) {
    throw new TypeError('ReadableStream is locked');
  }
  return stream;
}

function __ThrowIfStreamNotReadable(stream) {
  if ('readable' !== stream[__state]) {
    throw new TypeError('ReadableStream is not in readable state');
  }
  return stream;
}

/*******************************************************************************
 *
 * Class ReadableStream
 *
 ******************************************************************************/
/*
[ISSUE]: 3.2.1 Class Definition
"constructor(underlyingSource = {}, { size, highWaterMark = 1 } = {})"
should read
"constructor(underlyingSource = {}, { size, highWaterMark } = {})"
(see below for reasoning).
*/
export default class ReadableStream {
  
/*
[ISSUE]: 3.2.3 title:
"new ReadableStream(underlyingSource = {}, { size, highWaterMark = 1 } = {})"
SHOULD READ
"new ReadableStream(underlyingSource = {}, { size, highWaterMark } = {})"

Having `highWaterMark` initialized to `1` means that steps `8.a` and `9.a`
are never executed. While step `9.a` would have no impact, step `8.a` would
always force `highWaterMark=1` on `ReadableByteStreamController` contructor.
*/
  constructor(underlyingSource = {}, { size, highWaterMark } = {}) {
  
    this[__state] = 'readable';
    this[__reader] = undefined;
    this[__storedError] = undefined;
    this[__disturbed] = false;
    this[__readableStreamController] = undefined;
    
    const type = String(underlyingSource.type);
    
    if (type === 'bytes') {
      if (typeof highWaterMark === 'undefined') {
        highWaterMark = 0;
      }
      
      this[__readableStreamController] =
        new ReadableByteStreamController(this, underlyingSource,
                                         highWaterMark);
      
    } else if (type === 'undefined') {
      if (typeof highWaterMark === 'undefined') {
        highWaterMark = 1;
      }
      
      this[__readableStreamController] =
        new ReadableStreamDefaultController(this, underlyingSource,
                                            size, highWaterMark);
      
    } else {
      throw new RangeError('Invalid underlying source type');
    }
  }
  
  get locked() {
    __ThrowIfNotReadableStream(this);
    return IsReadableStreamLocked(this);
  }
  
  cancel(reason) {
    debug1('ReadableStream::cancel()');
    
    try {
      __ThrowIfNotReadableStream(this);
      __ThrowIfReadableStreamLocked(this);
    } catch (e) {
      debug5('ReadableStream::cancel()#CATCH:', e);
      ensureAssertionThrows(e, true);
      return Promise.reject(e);
    }
    
    return ReadableStreamCancel(this, reason);
  }
  
  getReader({mode} = {}) {
    debug1('ReadableStream::getReader()');
    __ThrowIfNotReadableStream(this);

    if (mode === 'byob') {
      const controller = this[__readableStreamController];
      
      if (false === IsReadableByteStreamController(controller)) {
        throw new TypeError('ReadableStream has invalid controller');
      }
      
      return AcquireReadableStreamBYOBReader(this);
    } else if (typeof mode === 'undefined') {
      return AcquireReadableStreamDefaultReader(this);
    }
    
    throw new RangeError('Invalid mode');
  }
  
  pipeThrough({writable, readable}, options) {
    debug1('ReadableStream::pipeThrough()');
    this.pipeTo(writable, options);
    return readable;
  }
  
  pipeTo(dest, {preventClose, preventAbort, preventCancel} = {}) {
    debug1('ReadableStream::pipeTo()');
    //throw new TypeError('Not yet implemented');
    return rsFixtures.pipeTo.apply(this, arguments);
  }
  
  tee() {
    debug1('ReadableStream::tee()');
    __ThrowIfNotReadableStream(this);
    const branches = ReadableStreamTee(this, false);
    return CreateArrayFromList(branches);
  }

}

/*******************************************************************************
 *
 * ReadableStream Operations
 *
 ******************************************************************************/

function AcquireReadableStreamBYOBReader(stream) {
  return new ReadableStreamBYOBReader(stream);
}

function AcquireReadableStreamDefaultReader(stream) {
  return new ReadableStreamDefaultReader(stream);
}

function IsReadableStream(o) {
  return (isObject(o) &&
          hasInternalSlot(o, __readableStreamController));
}

/*
function IsReadableStreamDisturbed(stream) {
  assert(IsReadableStream(stream), 'stream must be a ReadableStream');
  return stream[__disturbed];
}
*/

function IsReadableStreamLocked(stream) {
  assert(IsReadableStream(stream), 'stream must be a ReadableStream');
  return (typeof stream[__reader] !== 'undefined');
}


function ReadableStreamTee(stream, shouldClone) {
  assert(IsReadableStream(stream) === true,
    'stream should be a readable stream');
  assert(typeof shouldClone === 'boolean', 'shouldClone must be a boolean');
  
  const reader = AcquireReadableStreamDefaultReader(stream);
  const teeState = {
    closedOrError: false,
    canceled1: false,
    canceled2: false,
    reason1: undefined,
    reason2: undefined,
    promiseHandle: CreatePromiseHandle(),
    get promise() {
      return this.promiseHandle.promise;
    }
  };
  
  const pull = CreateRSTeePullFunction();
  
  pull.reader = reader;
  pull.teeState = teeState;
  pull.shouldClone = shouldClone;
  
  const cancel1 = CreateRSTeeBranch1CancelFunction();
  cancel1.stream = stream;
  cancel1.teeState = teeState;
  
  const cancel2 = CreateRSTeeBranch2CancelFunction();
  cancel2.stream = stream;
  cancel2.teeState = teeState;
  
  const underlyingSource1 = {pull, cancel: cancel1};
  const branch1Stream = new ReadableStream(underlyingSource1);
  const underlyingSource2 = {pull, cancel: cancel2};
  const branch2Stream = new ReadableStream(underlyingSource2);
  
  pull.branch1 = branch1Stream[__readableStreamController];
  pull.branch2 = branch2Stream[__readableStreamController];
  
  reader[__closedPromise].catch((r) => {
    if (teeState.closedOrErrored === true) {
      return undefined;
    }
    
    DefaultControllerError(pull.branch1, r);
    DefaultControllerError(pull.branch2, r);
    
    teeState.closedOrErrored = true;
  });
  
  return [branch1Stream, branch2Stream];
}

function CreateRSTeePullFunction() {
  const f = () => {
    const {reader, branch1, branch2, teeState, shouldClone } = f;
    
    return ReadableStreamDefaultReaderRead(reader).then((result) => {
      assert(isObject(result), 'result must be an object');
      const value = result.value;
      const done = result.done;
      assert(typeof done === 'boolean', 'done must be a boolean');
      
      if (done === true && teeState.closedOrErrored === false) {
        if (teeState.canceled1 === false) {
          DefaultControllerClose(branch1);
        }
        
        if (teeState.canceled2 === false) {
          DefaultControllerClose(branch2);
        }
        
        teeState.closedOrErrored = true;
      }
      
      if (teeState.closedOrErrored === true) {
        return undefined;
      }
      
      if (teeState.canceled1 === false) {
        const value1 = (shouldClone === true ? StructuredClone(value) : value);
        DefaultControllerEnqueue(branch1, value1);
      }
      
      if (teeState.canceled2 === false) {
        const value2 = (shouldClone === true ? StructuredClone(value) : value);
        DefaultControllerEnqueue(branch2, value2);
      }
    });
  };
  
  return f;
}

function CreateRSTeeBranch1CancelFunction() {
  const f = (reason) => {
    const {stream, teeState} = f;
    
    teeState.canceled1 = true;
    teeState.reason1 = reason;
    
    if (teeState.canceled2 === true) {
      const compositeReason = [teeState.reason1, teeState.reason2];
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState.promiseHandle.resolve(cancelResult);
    }
    
    return teeState.promise;
  };
  
  return f;
}

function CreateRSTeeBranch2CancelFunction() {
  const f = (reason) => {
    const {stream, teeState} = f;
    
    teeState.canceled2 = true;
    teeState.reason2 = reason;
    
    if (teeState.canceled1 === true) {
      const compositeReason = [teeState.reason1, teeState.reason2];
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState.promiseHandle.resolve(cancelResult);
    }
    
    return teeState.promise;
  };
  
  return f;
}

function ReadableStreamCancel(stream, reason) {
  debug1('ReadableStreamCancel()');
  assert(typeof stream !== 'undefined', 'valid stream required');
  stream[__disturbed] = true;
  
  if (stream[__state] === 'closed') {
    return Promise.resolve(undefined);
  } else if (stream[__state] === 'errored') {
    return Promise.reject(stream[__storedError]);
  }
  
  ReadableStreamClose(stream);
  
  const sourceCancelPromise =
    stream[__readableStreamController][InternalCancel](reason);
  
  return sourceCancelPromise.then(() => undefined, () => undefined);
}

function ReadableStreamClose(stream) {
  debug1('ReadableStreamClose()');
  assert(stream[__state] === 'readable', 'stream must have readable state');
  stream[__state] = 'closed';
  const reader = stream[__reader];
  if (typeof reader !== 'undefined') {
    
    if (IsReadableStreamDefaultReader(reader) === true) {
      reader[__readRequests].forEach(
        //__CreateObjectPromiseResolve(CreateIterResultObject(undefined, true))
        (handle) => handle.resolve(CreateIterResultObject(undefined, true))
      );
      
      reader[__readRequests] = [];
    }
    
    reader[__handleClosedPromise].resolve(undefined);
  }
  
  return undefined;
}

function ReadableStreamError(stream, e) {
  debug1('ReadableStreamError()');
  assert(IsReadableStream(stream) === true, 'ReadableStream required');
  assert(stream[__state] === 'readable', 'stream must have readable state');
  stream[__state] = 'errored';
  stream[__storedError] = e;
  const reader = stream[__reader];
  if (typeof reader !== 'undefined') {
    if (IsReadableStreamDefaultReader(reader) === true) {
      reader[__readRequests].forEach((handle) => handle.reject(e));
      reader[__readRequests] = [];
    } else {
      assert(IsReadableStreamBYOBReader(reader) === true, 'BYOBReader needed');
      reader[__readIntoRequests].forEach((handle) => handle.reject(e));
      reader[__readIntoRequests] = [];
    }
    
    reader[__handleClosedPromise].reject(e);
  }
  
  return undefined;
}

function ReadableStreamFulfillReadRequest(stream, chunk, done) {
  const reader = stream[__reader];
  const readRequest = reader[__readRequests].shift();
  readRequest.resolve(CreateIterResultObject(chunk, done));
}

function ReadableStreamFulfillReadIntoRequest(stream, chunk, done) {
  const reader = stream[__reader];
  const readIntoRequest = reader[__readIntoRequests].shift();
  readIntoRequest.resolve(CreateIterResultObject(chunk, done));
}

function ReadableStreamAddReadRequest(stream) {
  const reader = stream[__reader];
  assert(true === IsReadableStreamDefaultReader(reader),
          'ReadableStreamDefaultReader expected');

  //const readRequest = __CreateObjectPromise();
  const readRequest = CreatePromiseHandle();
  reader[__readRequests].push(readRequest);

  return readRequest.promise;
}

function ReadableStreamAddReadIntoRequest(stream) {
  const reader = stream[__reader];
  assert(true === IsReadableStreamBYOBReader(reader),
        'ReadableStreamBYOBReader expected');

  //const readRequest = __CreateObjectPromise();
  const readRequest = CreatePromiseHandle();
  reader[__readIntoRequests].push(readRequest);

  return readRequest.promise;
}

function ReadableStreamGetNumReadRequests(stream) {
  return stream[__reader][__readRequests].length;
}

function ReadableStreamGetNumReadIntoRequests(stream) {
  return stream[__reader][__readIntoRequests].length;
}

function ReadableStreamHasBYOBReader(stream) {
  const reader = stream[__reader];
  return (typeof reader !== 'undefined' &&
          IsReadableStreamBYOBReader(reader));
}

function ReadableStreamHasDefaultReader(stream) {
  const reader = stream[__reader];
  return (typeof reader !== 'undefined' &&
          IsReadableStreamDefaultReader(reader));
}

/*******************************************************************************
 *
 * ReadableStream Readers
 *
 ******************************************************************************/

// Define internal slot property names.
const __closedPromise = Symbol('closedPromise');
const __handleClosedPromise = Symbol('handleClosedPromise');
const __ownerReadableStream = Symbol('ownerReadableStream');
const __readRequests = Symbol('readRequests');
const __readIntoRequests = Symbol('readIntoRequests');

function __ThrowIfNotDefaultReader(reader) {
  if (IsReadableStreamDefaultReader(reader) === false) {
    throw new TypeError('ReadableStreamDefaultReader instance required');
  }
  return reader;
}

function __ThrowIfNotBYOBReader(reader) {
  if (IsReadableStreamBYOBReader(reader) === false) {
    throw new TypeError('ReadableStreamBYOBReader instance required');
  }
  return reader;
}

function __ThrowIfNoOwner(reader) {
  const owner = reader[__ownerReadableStream];
  if (typeof owner === 'undefined') {
    throw new TypeError('Missing readable stream owner');
  }
  return owner;
}

function IsReadableStreamDefaultReader(reader) {
  return (isObject(reader) &&
          hasInternalSlot(reader, __readRequests));
}

function IsReadableStreamBYOBReader(reader) {
  return (isObject(reader) &&
          hasInternalSlot(reader, __readIntoRequests));
}

/*******************************************************************************
 *
 * Class ReadableStreamDefaultReader
 *
 ******************************************************************************/
export class ReadableStreamDefaultReader {
  
  constructor(stream) {
    __ThrowIfNotReadableStream(stream);
    __ThrowIfReadableStreamLocked(stream);
    
    ReadableStreamReaderGenericInitialize(this, stream);
    
    this[__readRequests] = [];
  }

  get closed() {
    try {
      __ThrowIfNotDefaultReader(this);
    } catch (e) {
      debug5('ReadableStreamDefaultReader::closed()#CATCH:', e);
      ensureAssertionThrows(e, true);
      return Promise.reject(e);
    }
    
    return this[__closedPromise];
  }

  cancel(reason) {
    debug2('ReadableStreamDefaultReader::cancel()');
    
    try {
      __ThrowIfNotDefaultReader(this);
      __ThrowIfNoOwner(this);
    } catch (e) {
      debug5('ReadableStreamDefaultReader::cancel()#CATCH:', e);
      ensureAssertionThrows(e, true);
      return Promise.reject(e);
    }
    
    return ReadableStreamCancel(this[__ownerReadableStream], reason);
  }
  
  read() {
    debug2('ReadableStreamDefaultReader::read()');
    try {
      __ThrowIfNotDefaultReader(this);
      __ThrowIfNoOwner(this);
    } catch (e) {
      debug5('ReadableStreamDefaultReader::read()#CATCH:', e);
      ensureAssertionThrows(e, true);
      return Promise.reject(e);
    }
    
    return ReadableStreamDefaultReaderRead(this);
  }
  
  releaseLock() {
    debug2('ReadableStreamDefaultReader::releaseLock()');
    __ThrowIfNotDefaultReader(this);
    
    if (typeof this[__ownerReadableStream] === 'undefined') {
      return undefined;
    }
    
    if (this[__readRequests].length > 0) {
      throw new TypeError('Failed to release: there are pending requests');
    }
    
    ReadableStreamReaderGenericRelease(this);
  }
}

function ReadableStreamDefaultReaderRead(reader) {
  const stream = reader[__ownerReadableStream];
  assert(typeof stream !== 'undefined', 'reader must have a valid stream');
  stream[__disturbed] = true;
  const streamState = stream[__state];
  if (streamState === 'closed') {
    return Promise.resolve(CreateIterResultObject(undefined, true));
  } else if (streamState === 'errored') {
    return Promise.reject(stream[__storedError]);
  } else {
    assert(streamState === 'readable', 'stream must have readable state');
    return stream[__readableStreamController][InternalPull]();
  }
}

function ReadableStreamBYOBReaderRead(reader, view) {
  const stream = reader[__ownerReadableStream];
  assert(typeof stream !== 'undefined', 'reader must have a valid stream');
  stream[__disturbed] = true;
  if (stream[__state] === 'errored') {
    return Promise.reject(stream[__storedError]);
  } else {
    return ByteStreamControllerPullInto(
      stream[__readableStreamController],
      view
    );
  }
}

/*******************************************************************************
 *
 * Class ReadableStreamBYOBReader
 *
 ******************************************************************************/
function __ThrowIfNotView(view) {
  /*
  if (false === isObject(view)) {
    throw new TypeError('Object argument expected');
  }
  */
  
  if (!ArrayBuffer.isView(view)) {
    throw new TypeError('A TypedArray view is required');
  }
  
  return view;
}

function __ThrowIfNotLengthyView(view) {
  __ThrowIfNotView(view);
  
  if (view.byteLength === 0) {
    throw new TypeError('Cannot read into zero-length view');
  }
  
  return view;
}
 
export class ReadableStreamBYOBReader {
  
  constructor(stream) {
    __ThrowIfNotReadableStream(stream);
    __ThrowIfReadableStreamLocked(stream);
    
    ReadableStreamReaderGenericInitialize(this, stream);
    
    this[__readIntoRequests] = [];
  }

  get closed() {
    try {
      __ThrowIfNotBYOBReader(this);
    } catch (e) {
      debug5('ReadableStreamBYOBReader::closed()#CATCH:', e);
      ensureAssertionThrows(e, true);
      return Promise.reject(e);
    }
    
    return this[__closedPromise];
  }

  cancel(reason) {
    debug2('ReadableStreamBYOBReader::cancel()');
    
    try {
      __ThrowIfNotBYOBReader(this);
      __ThrowIfNoOwner(this);
    } catch (e) {
      debug5('ReadableStreamBYOBReader::cancel()#CATCH:', e);
      ensureAssertionThrows(e, true);
      return Promise.reject(e);
    }
    
    return ReadableStreamCancel(this[__ownerReadableStream], reason);
  }
  
  read(view) {
    debug2('ReadableStreamBYOBReader::read()');
    
    try {
      __ThrowIfNotBYOBReader(this);
      __ThrowIfNoOwner(this);
      __ThrowIfNotLengthyView(view);
    } catch (e) {
      debug5('ReadableStreamBYOBReader::read()#CATCH:', e);
      debug5(e.name, e.constructor);
      ensureAssertionThrows(e, true);
      return Promise.reject(e);
    }
    
    return ReadableStreamBYOBReaderRead(this, view);
  }
  
  releaseLock() {
    debug2('ReadableStreamBYOBReader::releaseLock()');
    __ThrowIfNotBYOBReader(this);
    
    if (typeof this[__ownerReadableStream] === 'undefined') {
      return undefined;
    }
    
    if (this[__readIntoRequests].length > 0) {
      throw new TypeError('Failed to release: there are pending requests');
    }
    
    ReadableStreamReaderGenericRelease(this);
  }
}

/*******************************************************************************
 *
 * Generic Abstract Operations
 *
 ******************************************************************************/
function ReadableStreamReaderGenericInitialize(reader, stream) {
  debug4('ReadableStreamReaderGenericInitialize()');
  const streamState = stream[__state];
  
  reader[__ownerReadableStream] = stream;
  stream[__reader] = reader;
  
  if (streamState === 'readable') {
    reader[__handleClosedPromise] = CreatePromiseHandle();
    reader[__closedPromise] = reader[__handleClosedPromise].promise;
  } else if (streamState === 'closed') {
    reader[__handleClosedPromise] =
      CreatePromiseHandle(Promise.resolve(undefined));
    reader[__closedPromise] = reader[__handleClosedPromise].promise;
  } else {
    assert(streamState === 'errored', 'stream must be in errored state');
    reader[__handleClosedPromise] =
      CreatePromiseHandle(Promise.reject(stream[__storedError]));
    reader[__closedPromise] = reader[__handleClosedPromise].promise;
  }
}

function ReadableStreamReaderGenericRelease(reader) {
  debug4('ReadableStreamReaderGenericRelease()');
  const stream = reader[__ownerReadableStream];
  const streamState = stream[__state];
  
  assert(typeof stream !== 'undefined', 'valid ReadableStream expected');
  
  const streamReader = stream[__reader];
  assert(typeof streamReader !== 'undefined', 'stream reader expected');

  if (streamState === 'readable') {
    streamReader[__handleClosedPromise]
      .reject(new TypeError('Failed to release stream'));
  } else {
    streamReader[__handleClosedPromise] =
      CreatePromiseHandle(Promise.reject(new TypeError('Failed to release')));
    streamReader[__closedPromise] = streamReader[__handleClosedPromise].promise;
  }
  
  stream[__reader] = undefined;
  reader[__ownerReadableStream] = undefined;
}


/*******************************************************************************
 *
 * ReadableStream Controllers
 *
 ******************************************************************************/
 
// Define internal slot property names.
const __closeRequested = Symbol('closeRequested');
const __controlledReadableStream = Symbol('controlledReadableStream');
const __pullAgain = Symbol('pullAgain');
const __pulling = Symbol('pulling');
const __queue = Symbol('queue');
const __started = Symbol('started');
const __strategyHWM = Symbol('strategyHWM');
const __strategySize = Symbol('strategySize');
const __underlyingSource = Symbol('underlyingSource');

// Define internal method names.
const InternalCancel = Symbol('Cancel');
const InternalPull = Symbol('Pull');

function __ThrowIfNotDefaultController(stream) {
  if (IsReadableStreamDefaultController(stream) === false) {
    throw new TypeError('ReadableStreamDefaultController instance required');
  }
  return stream;
}

function __ThrowIfHasController(stream) {
  if (typeof stream[__readableStreamController] !== 'undefined') {
    throw new TypeError('ReadableStream already has a controller');
  }
  return stream;
}

function IsReadableStreamDefaultController(controller) {
  return (isObject(controller) &&
          hasInternalSlot(controller, __underlyingSource));
}

/*******************************************************************************
 *
 * Class ReadableStreamDefaultController
 *
 ******************************************************************************/
export class ReadableStreamDefaultController {
  constructor(stream, underlyingSource, size, highWaterMark) {
    __ThrowIfNotReadableStream(stream);
    __ThrowIfHasController(stream);
    
    this[__controlledReadableStream] = stream;
    this[__underlyingSource] = underlyingSource;
    this[__queue] = [];
    this[__started] = false;
    this[__closeRequested] = false;
    this[__pullAgain] = false;
    this[__pulling] = false;
    
    const strategy = ValidateAndNormalizeQS(size, highWaterMark);
    this[__strategySize] = strategy.size;
    this[__strategyHWM] = strategy.highWaterMark;
    
    const controller = this;
    const startResult = InvokeOrNoop(underlyingSource, 'start', [this]);
    
    Promise.resolve(startResult)
            .then(() => {
              controller[__started] = true;
              DefaultControllerCallPullIfNeeded(controller);
            },
            (r) => {
              if (stream[__state] === 'readable') {
                DefaultControllerError(controller, r);
              }
            })
            .catch(ensureAssertionThrows);
    
  }

  get desiredSize() {
    __ThrowIfNotDefaultController(this);
    return DefaultControllerGetDesiredSize(this);
  }

  /**
   * 3.8.4.2. close()
   * The close method will close the controlled readable stream. Consumers will
   * still be able to read any previously-enqueued chunks from the stream,
   * but once those are read, the stream will become closed.
   */
  close() {
    debug2('ReadableStreamDefaultController::close()');
    __ThrowIfNotDefaultController(this);

    if (this[__closeRequested] === true) {
      throw new TypeError('Controller close already requested');
    }
    
    __ThrowIfStreamNotReadable(this[__controlledReadableStream]);
    
    return DefaultControllerClose(this);
  }

  enqueue(chunk) {
    debug2('ReadableStreamDefaultController::enqueue()');
    __ThrowIfNotDefaultController(this);
    
    if (this[__closeRequested] === true) {
      throw new TypeError('Controller close already requested');
    }
    
    __ThrowIfStreamNotReadable(this[__controlledReadableStream]);
    
    return DefaultControllerEnqueue(this, chunk);
  }
  
  error(e) {
    debug2('ReadableStreamDefaultController::error()');
    __ThrowIfNotDefaultController(this);
    __ThrowIfStreamNotReadable(this[__controlledReadableStream]);
    
    DefaultControllerError(this, e);
  }
  
  [InternalCancel](reason) {
    debug2('ReadableStreamDefaultController::[[Cancel]]()');
    this[__queue] = [];
    return PromiseInvokeOrNoop(this[__underlyingSource], 'cancel', [reason]);
  }
  
  [InternalPull]() {
    debug2('ReadableStreamDefaultController::[[Pull]]()');
    const stream = this[__controlledReadableStream];
    if (this[__queue].length > 0) {
      const chunk = DequeueValue(this[__queue]);
      if (this[__closeRequested] === true &&
          this[__queue].length <= 0) {
        ReadableStreamClose(stream);
      } else {
        DefaultControllerCallPullIfNeeded(this);
      }
      
      return Promise.resolve(CreateIterResultObject(chunk, false));
    }
    
    const pendingPromise = ReadableStreamAddReadRequest(stream);
    DefaultControllerCallPullIfNeeded(this);
    return pendingPromise;
  }
}

function DefaultControllerCallPullIfNeeded(controller) {
  debug3('ReadableStreamDefaultControllerCallPullIfNeeded()');
  const shouldPull = DefaultControllerShouldCallPull(controller);
  
  if (shouldPull === false) {
    return undefined;
  }
  
  if (controller[__pulling] === true) {
    controller[__pullAgain] = true;
    return undefined;
  }
  
  controller[__pulling] = true;
  const pullPromise = PromiseInvokeOrNoop(controller[__underlyingSource],
                                          'pull',
                                          [controller]);
  
  pullPromise
    .then(() => {
      controller[__pulling] = false;
      if (controller[__pullAgain] === true) {
        controller[__pullAgain] = false;
        DefaultControllerCallPullIfNeeded(controller);
      }
    },
    (e) => {
      const stream = controller[__controlledReadableStream];
      if (stream[__state] === 'readable') {
        DefaultControllerError(controller, e);
      }
    })
    .catch(ensureAssertionThrows);
  
  return undefined;
}

function DefaultControllerShouldCallPull(controller) {
  debug3('ReadableStreamDefaultControllerShouldCallPull()');
  const stream = controller[__controlledReadableStream];
  const streamState = stream[__state];
  if (streamState === 'closed' || streamState === 'errored' ||
      controller[__closeRequested] === true ||
      controller[__started] === false) {
    
    return false;
  }
  
  if (IsReadableStreamLocked(stream) === true &&
      ReadableStreamGetNumReadRequests(stream) > 0) {
    return true;
  }
  return (DefaultControllerGetDesiredSize(controller) > 0);
}

function DefaultControllerClose(controller) {
  debug3('ReadableStreamDefaultControllerClose()');
  const stream = controller[__controlledReadableStream];
  assert(controller[__closeRequested] === false, 'controller must be open');
  assert(stream[__state] === 'readable', 'stream must be in readable state');
  controller[__closeRequested] = true;
  if (controller[__queue].length <= 0) {
    ReadableStreamClose(stream);
  }
}

function DefaultControllerEnqueue(controller, chunk) {
  debug3('ReadableStreamDefaultControllerEnqueue()');
  const stream = controller[__controlledReadableStream];
  
  assert(false === controller[__closeRequested],
        'controller must not be closed');
  assert('readable' === stream[__state], 'stream must have readable state');
  
  if (IsReadableStreamLocked(stream) === true &&
      ReadableStreamGetNumReadRequests(stream) > 0) {
    
    ReadableStreamFulfillReadRequest(stream, chunk, false);
  } else {
    let chunkSize = 1;
    
    const onError = (e) => {
      if (stream[__state] === 'readable') {
        DefaultControllerError(controller, e);
      }
      return e;
    };
    
    if (typeof controller[__strategySize] !== 'undefined') {
      try {
        chunkSize = stream[__strategySize](undefined, chunk);
      } catch (e) {
        return onError(e);
      }
    }
    
    try {
      EnqueueValueWithSize(controller[__queue], chunk, chunkSize);
    } catch (e) {
      return onError(e);
    }
  }
  
  DefaultControllerCallPullIfNeeded(controller);
  
  return undefined;
}

function DefaultControllerError(controller, e) {
  debug3('ReadableStreamDefaultControllerError()');
  const stream = controller[__controlledReadableStream];
  assert(stream[__state] === 'readable', 'stream must be in readable state');
  controller[__queue] = [];
  ReadableStreamError(stream, e);
}

function DefaultControllerGetDesiredSize(controller) {
  const queueSize = GetTotalQueueSize(controller[__queue]);
  return controller[__strategyHWM] - queueSize;
}

/*******************************************************************************
 *
 * Class ReadableByteStreamController
 *
 ******************************************************************************/
const __autoAllocateChunkSize = Symbol('autoAllocateChunkSize');
const __byobRequest = Symbol('byobRequest');
const __pendingPullIntos = Symbol('pendingPullIntos');
const __totalQueuedBytes = Symbol('totalQueuedBytes');
const __underlyingByteSource = Symbol('underlyingByteSource');

function __ThrowIfNotByteStreamController(stream) {
  if (IsReadableByteStreamController(stream) === false) {
    throw new TypeError('ReadableByteStreamController instance required');
  }
  return stream;
}

export class ReadableByteStreamController {
  constructor(stream, underlyingByteSource, highWaterMark) {
    var autoAllocateChunkSize;
    
    __ThrowIfNotReadableStream(stream);
    __ThrowIfHasController(stream);
    
    this[__controlledReadableStream] = stream;
    this[__underlyingByteSource] = underlyingByteSource;
    this[__pullAgain] = false;
    this[__pulling] = false;
    
    ByteStreamControllerClearPendingPullIntos(this);
    
    this[__queue] = [];
    this[__totalQueuedBytes] = 0;
    this[__started] = false;
    this[__closeRequested] = false;
    this[__strategyHWM] = ValidateAndNormalizeHWM(highWaterMark);
    
    autoAllocateChunkSize = underlyingByteSource.autoAllocateChunkSize;
    if (typeof autoAllocateChunkSize !== 'undefined') {
      autoAllocateChunkSize = Number(autoAllocateChunkSize);
      if (autoAllocateChunkSize < 0 ||
          Number.isInteger(autoAllocateChunkSize) === false) {
        
        throw new RangeError('Invalid non-integer auto allocate size');
      }
    }
    
    this[__autoAllocateChunkSize] = autoAllocateChunkSize;
    this[__pendingPullIntos] = [];
    
    const controller = this;
    const startResult = InvokeOrNoop(underlyingByteSource, 'start', [this]);
    
    Promise.resolve(startResult)
            .then(() => {
              controller[__started] = true;
              assert(false === controller[__pulling],
                      'controller[[pulling]] must be false');
              assert(false === controller[__pullAgain],
                      'controller[[pullAgain]] must be false');
              ByteStreamControllerCallPullIfNeeded(controller);
            })
            .catch((reason) => {
              if (stream[__state] === 'readable') {
                ByteStreamControllerError(controller, reason);
              }
            })
            .catch(ensureAssertionThrows);
  }

  get byobRequest() {
    debug4('ReadableByteStreamController()::byobRequest()');
    __ThrowIfNotByteStreamController(this);
    if (typeof this[__byobRequest] === 'undefined' &&
        this[__pendingPullIntos].length > 0) {
      
      const firstDescriptor = this[__pendingPullIntos][0];
      const offset = firstDescriptor.byteOffset + firstDescriptor.bytesFilled;
      const length = firstDescriptor.byteLength - firstDescriptor.bytesFilled;
      const view = new Uint8Array(firstDescriptor.buffer, offset, length);
      
      this[__byobRequest] = new ReadableStreamBYOBRequest(this, view);
    }
    
    return this[__byobRequest];
  }
  
  get desiredSize() {
    __ThrowIfNotByteStreamController(this);
    return ByteStreamControllerGetDesiredSize(this);
  }

  close() {
    debug4('ReadableByteStreamController()::close()');
    __ThrowIfNotByteStreamController(this);
    
    if (this[__closeRequested] === true) {
      throw new TypeError('Controller close already requested');
    }
    
    __ThrowIfStreamNotReadable(this[__controlledReadableStream]);
    
    ByteStreamControllerClose(this);
  }
  
  enqueue(chunk) {
    debug4('ReadableByteStreamController()::enqueue()');
    __ThrowIfNotByteStreamController(this);
    
    if (this[__closeRequested] === true) {
      throw new TypeError('Controller close already requested');
    }
    
    __ThrowIfStreamNotReadable(this[__controlledReadableStream]);
    __ThrowIfNotView(chunk);
    
    ByteStreamControllerEnqueue(this, chunk);
  }
  
  error(e) {
    debug4('ReadableByteStreamController()::error()');
    __ThrowIfNotByteStreamController(this);
    __ThrowIfStreamNotReadable(this[__controlledReadableStream]);
    ByteStreamControllerError(this, e);
  }
  
  [InternalCancel](reason) {
    debug4('ReadableByteStreamController()::[[Cancel]]()');
    if (this[__pendingPullIntos].length > 0) {
      const firstDescriptor = this[__pendingPullIntos][0];
      firstDescriptor.bytesFilled = 0;
    }
    
    this[__queue] = [];
    this[__totalQueuedBytes] = 0;
    
    return PromiseInvokeOrNoop(this[__underlyingByteSource],
                                'cancel',
                                [reason]);
  }
  
  [InternalPull]() {
    debug4('ReadableByteStreamController()::[[Pull]]()');
    const stream = this[__controlledReadableStream];
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      if (this[__totalQueuedBytes] > 0) {
        const entry = this[__queue].shift();
        this[__totalQueuedBytes] -= entry.byteLength;
        ByteStreamControllerHandleQueueDrain(this);
        const view = new Uint8Array(entry.buffer,
                                    entry.byteOffset,
                                    entry.byteLength);
        
        return Promise.resolve(CreateIterResultObject(view, false));
      }
      
      const autoAllocateChunkSize = this[__autoAllocateChunkSize];
      
      if (typeof autoAllocateChunkSize !== 'undefined') {
        const buffer = new ArrayBuffer(autoAllocateChunkSize);
        const pullIntoDescriptor = {
          'buffer': buffer,
          'byteOffset': 0,
          'byteLength': autoAllocateChunkSize,
          'bytesFilled': 0,
          'elementSize': 1,
          'ctor': Uint8Array,
          'readerType': 'default'
        };
        
        this[__pendingPullIntos].push(pullIntoDescriptor);
      }
    } else {
      assert(typeof this[__autoAllocateChunkSize] === 'undefined',
              'autoAllocateChunkSize must not be set');
    }
    
    const promise = ReadableStreamAddReadRequest(stream);

    ByteStreamControllerCallPullIfNeeded(this);
    
    return promise;
  }
}

function IsReadableByteStreamController(controller) {
  return (isObject(controller) &&
          hasInternalSlot(controller, __underlyingByteSource));
}

function ByteStreamControllerCallPullIfNeeded(controller) {
  debug4('ByteStreamControllerCallPullIfNeeded()');
  if (ByteStreamControllerShouldCallPull(controller) === false) {
    return undefined;
  }
  
  if (controller[__pulling] === true) {
    controller[__pullAgain] = true;
    return undefined;
  }
  
  controller[__pullAgain] = false;
  controller[__pulling] = true;
  
  const pullPromise = PromiseInvokeOrNoop(
    controller[__underlyingByteSource],
    'pull',
    [controller]
  );
  
  pullPromise
    .then(
      () => {
        controller[__pulling] = false;
        if (controller[__pullAgain] === true) {
          controller[__pullAgain] = false;
          ByteStreamControllerCallPullIfNeeded(controller);
        }
      },
      (e) => {
        if (controller[__controlledReadableStream][__state] === 'readable') {
          ByteStreamControllerError(controller, e);
        }
      }
    )
    .catch(ensureAssertionThrows);
  
  return undefined;
}

function ByteStreamControllerClearPendingPullIntos(controller) {
  if (typeof controller[__byobRequest] !== 'undefined') {
    ReadableStreamBYOBRequestInvalidate(controller[__byobRequest]);
    controller[__byobRequest] = undefined;
  }
  
  controller[__pendingPullIntos] = [];
}

function ByteStreamControllerClose(controller) {
  debug4('ByteStreamControllerClose()');
  const stream = controller[__controlledReadableStream];
  
  assert(controller[__closeRequested] === false,
        'controller must not be closed');
  assert(stream[__state] === 'readable', 'stream must be in readable state');
  
  if (controller[__totalQueuedBytes] > 0) {
    controller[__closeRequested] = true;
    return;
  }
  
  const firstPendingPullInto = controller[__pendingPullIntos][0];
  
  if (ReadableStreamHasBYOBReader(stream) === true &&
      controller[__pendingPullIntos].length > 0 &&
      firstPendingPullInto.bytesFilled > 0) {
    
    const e = new TypeError('Failed ByteStreamControllerClose()');
    ByteStreamControllerError(controller, e);
    throw e;
  }
  
  ReadableStreamClose(stream);
}

function ByteStreamControllerCommitPullIntoDescriptor(stream, descriptor) {
  debug5('ByteStreamControllerCommitPullIntoDescriptor()');
  assert(stream[__state] !== 'errored', 'stream must not be errored');
  
  var done = false;
  if (stream[__state] === 'closed') {
    assert(descriptor.bytesFilled === 0,
          'closed stream must have zero byte filled');
    done = true;
  }
  
  const filledView = ByteStreamControllerConvertPullIntoDescriptor(descriptor);
  
  if (descriptor.readerType === 'default') {
    ReadableStreamFulfillReadRequest(stream, filledView, done);
  } else {
    assert(descriptor.readerType === 'byob', 'descriptor reader must be BYOB');
    ReadableStreamFulfillReadIntoRequest(stream, filledView, done);
  }
  
}

function ByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor) {
  debug5('ByteStreamControllerFillHeadPullIntoDescriptor()');
  
  const bytesFilled = pullIntoDescriptor.bytesFilled;
  const elementSize = pullIntoDescriptor.elementSize;
  
  assert(bytesFilled <= pullIntoDescriptor.byteLength,
          'bytesFilled must be less or equal to descriptor.byteLength');
  assert(bytesFilled % elementSize === 0, 'at least one element required');
  
  return new pullIntoDescriptor.ctor(
    pullIntoDescriptor.buffer,
    pullIntoDescriptor.byteOffset,
    bytesFilled / elementSize
  );
}

function ByteStreamControllerEnqueue(controller, chunk) {
  debug4('ByteStreamControllerEnqueue()');
  const stream = controller[__controlledReadableStream];
  assert(controller[__closeRequested] === false, 'controller close requested');
  assert(stream[__state] === 'readable', 'state must be readable');
  
  const buffer = chunk.buffer;
  const byteOffset = chunk.byteOffset;
  const byteLength = chunk.byteLength;
  
  if (ReadableStreamHasDefaultReader(stream) === true) {
    if (ReadableStreamGetNumReadRequests(stream) === 0) {
      const transferredBuffer = SameRealmTransfer(buffer);
      ByteStreamControllerEnqueueChunkToQueue(
        controller,
        transferredBuffer,
        byteOffset,
        byteLength
      );
    } else {
      assert(controller[__queue].length <= 0, 'controller queue not empty');
      const transferredBuffer = SameRealmTransfer(buffer);
      const transferredView = new Uint8Array(
        transferredBuffer,
        byteOffset,
        byteLength
      );
      
      ReadableStreamFulfillReadRequest(stream, transferredView, false);
    }
  } else {
    if (ReadableStreamHasBYOBReader(stream) === true) {
      const transferredBuffer = SameRealmTransfer(buffer);
      ByteStreamControllerEnqueueChunkToQueue(
        controller,
        transferredBuffer,
        byteOffset,
        byteLength
      );
      
      ByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
    } else {
      assert(IsReadableStreamLocked(stream) === false,
              'stream must not be locked');
      const transferredBuffer = SameRealmTransfer(buffer);
      ByteStreamControllerEnqueueChunkToQueue(
        controller,
        transferredBuffer,
        byteOffset,
        byteLength
      );
    }
  }
}

function ByteStreamControllerEnqueueChunkToQueue(controller, buffer,
  byteOffset, byteLength) {
  
  controller[__queue].push({buffer, byteOffset, byteLength});
  controller[__totalQueuedBytes] += byteLength;
}

function ByteStreamControllerError(controller, e) {
  debug4('ByteStreamControllerError()');
  const stream = controller[__controlledReadableStream];
  assert(stream[__state] === 'readable', 'stream must be in readable state');
  ByteStreamControllerClearPendingPullIntos(controller);
  controller[__queue] = [];
  ReadableStreamError(stream, e);
}

function ByteStreamControllerFillHeadPullIntoDescriptor(controller, size,
  pullIntoDescriptor) {
  
  debug5('ByteStreamControllerFillHeadPullIntoDescriptor()');
  assert(controller[__pendingPullIntos].length <= 0 ||
          controller[__pendingPullIntos][0] === pullIntoDescriptor,
          'No pending descriptors, or one that is the same with parameter');
          
  if (typeof controller[__byobRequest] !== 'undefined') {
    ReadableStreamBYOBRequestInvalidate(controller[__byobRequest]);
    controller[__byobRequest] = undefined;
  }
  
  pullIntoDescriptor.bytesFilled += size;
}

function ByteStreamControllerFillPullIntoDescriptorFromQueue(controller, desc) {
  debug5('ByteStreamControllerFillPullIntoDescriptorFromQueue()');
  const elementSize = desc.elementSize;
  const bytesFilled = desc.bytesFilled;
  const totalQueuedBytes = controller[__totalQueuedBytes];
  const byteLength = desc.byteLength;
  const currentAlignedBytes = bytesFilled - (bytesFilled % elementSize);
  const maxBytesToCopy = Math.min(totalQueuedBytes, byteLength - bytesFilled);
  const maxBytesFilled = bytesFilled + maxBytesToCopy;
  const maxAlignedBytes = maxBytesFilled - (maxBytesFilled % elementSize);
  var totalBytesToCopyRemaining = maxBytesToCopy;
  var ready = false;
  
  if (maxAlignedBytes > currentAlignedBytes) {
    totalBytesToCopyRemaining = maxAlignedBytes - bytesFilled;
    ready = true;
  }
  
  const queue = controller[__queue];
  
  var head;
  var numBytes;
  var dstStart;
  while (totalBytesToCopyRemaining > 0) {
    head = queue[0];
    numBytes = Math.min(totalBytesToCopyRemaining, head.byteLength);
    dstStart = desc.byteOffset + desc.bytesFilled;
    
    debug5('CopyBytes(<<srcBuffer>>, head.byteOffset = %s,' +
            '<<dstBuffer>>, dstStart = %s, numBytes = %s',
            head.byteOffset, dstStart, numBytes);
    
    CopyDataBlockBytes(head.buffer,
                        head.byteOffset,
                        desc.buffer,
                        dstStart,
                        numBytes);
    
    if (head.byteLength === numBytes) {
      queue.shift();
    } else {
      head.byteOffset += numBytes;
      head.byteLength -= numBytes;
    }
    
    controller[__totalQueuedBytes] -= numBytes;
    ByteStreamControllerFillHeadPullIntoDescriptor(
      controller,
      numBytes,
      desc
    );
    
    totalBytesToCopyRemaining -= numBytes;
  }
  
  if (ready === false) {
    assert(controller[__totalQueuedBytes] === 0,
          'total queued bytes must be 0');
    assert(desc.bytesFilled > 0,
          'must have bytesFilled > 0');
    assert(desc.bytesFilled < desc.elementSize,
          'bytesFilled must be < that desc.elementSize');
  }
  
  return ready;
}

function ByteStreamControllerGetDesiredSize(controller) {
  debug4('ByteStreamControllerGetDesiredSize()');
  return (controller[__strategyHWM] - controller[__totalQueuedBytes]);
}

function ByteStreamControllerHandleQueueDrain(controller) {
  const stream = controller[__controlledReadableStream];
  assert(stream[__state] === 'readable', 'stream must be in readable state');
  if (controller[__totalQueuedBytes] === 0 &&
      controller[__closeRequested] === true) {
    
    ReadableStreamClose(stream);
  } else {
    ByteStreamControllerCallPullIfNeeded(controller);
  }
}

function ByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller) {
  debug5('ByteStreamControllerProcessPullIntoDescriptorsUsingQueue()');
  assert(controller[__closeRequested] === false,
          'controller must not be closed');
  while (controller[__pendingPullIntos].length > 0) {
    if (controller[__totalQueuedBytes] === 0) {
      break;
    }
    
    const pullIntoDescriptor = controller[__pendingPullIntos][0];
    
    if (true === ByteStreamControllerFillPullIntoDescriptorFromQueue(
          controller,
          pullIntoDescriptor
        )) {
     
      ByteStreamControllerShiftPendingPullInto(controller);
      ByteStreamControllerCommitPullIntoDescriptor(
        controller[__controlledReadableStream],
        pullIntoDescriptor
      );
    }
    
  }
}

function ByteStreamControllerPullInto(controller, view) {
  debug4('ByteStreamControllerPullInto()');
  const stream = controller[__controlledReadableStream];
  var elementSize = 1;

  if (!(view instanceof DataView)) {
    elementSize = view.BYTES_PER_ELEMENT;
  }
  
  const ctor = view.constructor;
  
  const pullIntoDescriptor = {
    buffer: view.buffer,
    byteOffset: view.byteOffset,
    byteLength: view.byteLength,
    bytesFilled: 0,
    elementSize,
    ctor,
    readerType: 'byob'
  };

  if (controller[__pendingPullIntos].length > 0) {
    pullIntoDescriptor.buffer = SameRealmTransfer(pullIntoDescriptor.buffer);
    controller[__pendingPullIntos].push(pullIntoDescriptor);
    return ReadableStreamAddReadIntoRequest(stream);
  }
  
  if (stream[__state] === 'closed') {
    const emptyView = new ctor(view.buffer, view.byteOffset, 0);
    return Promise.resolve(CreateIterResultObject(emptyView, true));
  }

  if (controller[__totalQueuedBytes] > 0) {
    if (true ===
        ByteStreamControllerFillPullIntoDescriptorFromQueue(
          controller,
          pullIntoDescriptor
        )) {
     
      const filledView =
        ByteStreamControllerConvertPullIntoDescriptor(pullIntoDescriptor);

      ByteStreamControllerHandleQueueDrain(controller);

      return Promise.resolve(CreateIterResultObject(filledView, false));
    }
    
    if (controller[__closeRequested] === true) {
      const e = new TypeError('Close requested');
      ByteStreamControllerError(controller, e);
      return Promise.reject(e);
    }
  }
  
  pullIntoDescriptor.buffer = SameRealmTransfer(pullIntoDescriptor.buffer);
  controller[__pendingPullIntos].push(pullIntoDescriptor);
  
  const promise = ReadableStreamAddReadIntoRequest(stream);
  
  ByteStreamControllerCallPullIfNeeded(controller);
  
  return promise;
}

function ByteStreamControllerRespond(controller, bytesWritten) {
  bytesWritten = Number(bytesWritten);
  if (IsFiniteNonNegativeNumber(bytesWritten) === false) {
    throw new RangeError('Invalid bytesWritten value');
  }
  
  assert(controller[__pendingPullIntos].length > 0,
        'pending pullIntos expected');
  ByteStreamControllerRespondInternal(controller, bytesWritten);
}

function ByteStreamControllerRespondInClosedState(controller, firstDescriptor) {
  firstDescriptor.buffer = SameRealmTransfer(firstDescriptor.buffer);
  assert(firstDescriptor.bytesFilled === 0,
        'first descriptor bytesFilled must be 0');
  const stream = controller[__controlledReadableStream];
  
  while (ReadableStreamGetNumReadIntoRequests(stream) > 0) {
    const pullIntoDescriptor =
      ByteStreamControllerShiftPendingPullInto(controller);
    
    ByteStreamControllerCommitPullIntoDescriptor(stream, pullIntoDescriptor);
  }
}

function ByteStreamControllerRespondInReadableState(
          controller,
          bytesWritten,
          pullIntoDescriptor) {

  debug5('ByteStreamControllerRespondInReadableState()');
  if (pullIntoDescriptor.bytesFilled + bytesWritten >
      pullIntoDescriptor.byteLength) {
    
    throw new RangeError('Exceeded byteLength');
  }
  
  ByteStreamControllerFillHeadPullIntoDescriptor(
    controller,
    bytesWritten,
    pullIntoDescriptor
  );
  
  if (pullIntoDescriptor.bytesFilled < pullIntoDescriptor.elementSize) {
    return;
  }
  
  ByteStreamControllerShiftPendingPullInto(controller);
  
  const chunkSize = pullIntoDescriptor.bytesFilled %
                        pullIntoDescriptor.elementSize;
  
  if (chunkSize > 0) {
    const end = pullIntoDescriptor.byteOffset + pullIntoDescriptor.bytesFilled;
    
    // const start = end - chunkSize;
    // const chunk = new ArrayBuffer(chunkSize);
    // CopyBytes(chunkSize, pullIntoDescriptor.buffer, start, chunk, 0);
    
    const chunk =
      CloneArrayBuffer(pullIntoDescriptor.buffer,
                        end - chunkSize,
                        chunkSize,
                        ArrayBuffer);
    
    ByteStreamControllerEnqueueChunkToQueue(
      controller,
      chunk,
      0,
      chunk.byteLength
    );
  }
  
  //pullIntoDescriptor.buffer=__transferArrayBuffer(pullIntoDescriptor.buffer);
  pullIntoDescriptor.buffer = SameRealmTransfer(pullIntoDescriptor.buffer);
  pullIntoDescriptor.bytesFilled -= chunkSize;
  
  ByteStreamControllerCommitPullIntoDescriptor(
    controller[__controlledReadableStream],
    pullIntoDescriptor
  );
  
  ByteStreamControllerProcessPullIntoDescriptorsUsingQueue(controller);
  
}

function ByteStreamControllerRespondInternal(controller, bytesWritten) {
  const firstDescriptor = controller[__pendingPullIntos][0];
  const stream = controller[__controlledReadableStream];
  
  if (stream[__state] === 'closed') {
    if (bytesWritten !== 0) {
      throw new TypeError('Cannot accept bytesWritten for closed stream');
    }
    
    ByteStreamControllerRespondInClosedState(controller, firstDescriptor);
  } else {
    assert(stream[__state] === 'readable', 'stream must be in readable state');
    ByteStreamControllerRespondInReadableState(
      controller,
      bytesWritten,
      firstDescriptor
    );
  }
}

function ByteStreamControllerRespondWithNewView(controller, view) {
  assert(controller[__pendingPullIntos].length > 0,
          'must have pending pullIntos');
  const firstDescriptor = controller[__pendingPullIntos][0];
  
  if (firstDescriptor.byteOffset + firstDescriptor.bytesFilled !==
      view.byteOffset) {
    
    throw new RangeError('View and descriptor are misaligned');
  }
  
  if (firstDescriptor.byteLength !== view.byteLength) {
    throw new RangeError('View and descriptor have different capacity');
  }
  
  firstDescriptor.buffer = view.buffer;
  ByteStreamControllerRespondInternal(controller, view.byteLength);
}

function ByteStreamControllerShiftPendingPullInto(controller) {
  const descriptor = controller[__pendingPullIntos].shift();
  if (typeof controller[__byobRequest] !== 'undefined') {
    ReadableStreamBYOBRequestInvalidate(controller[__byobRequest]);
    controller[__byobRequest] = undefined;
  }
  return descriptor;
}

function ByteStreamControllerShouldCallPull(controller) {
  debug4('ByteStreamControllerShouldCallPull()');
  const stream = controller[__controlledReadableStream];
  if (stream[__state] !== 'readable' ||
      controller[__closeRequested] === true ||
      controller[__started] === false) {
    
    return false;
  }
  
  if (ReadableStreamHasDefaultReader(stream) === true &&
      ReadableStreamGetNumReadRequests(stream) > 0) {
    
    return true;
  }
  
  if (ReadableStreamHasBYOBReader(stream) === true &&
      ReadableStreamGetNumReadIntoRequests(stream) > 0) {
   
    return true;
  }
  
  if (ByteStreamControllerGetDesiredSize(controller) > 0) {
    return true;
  }
  
  return false;
}

function ReadableStreamBYOBRequestInvalidate(request) {
  debug5('ReadableStreamBYOBRequestInvalidate()', typeof request);
  request[__associatedReadableByteStreamController] = undefined;
  request[__view] = undefined;
}

/*******************************************************************************
 *
 * Class ReadableStreamBYOBRequest
 *
 ******************************************************************************/
const __associatedReadableByteStreamController =
  Symbol('associatedReadableByteStreamController');
const __view = Symbol('view');

export class ReadableStreamBYOBRequest {
  constructor(controller, view) {
    this[__associatedReadableByteStreamController] = controller;
    this[__view] = view;
  }

  get view() {
    __ThrowIfNotBYOBRequest(this);
    return this[__view];
  }

  respond(bytesWritten) {
    debug5('ReadableStreamBYOBRequest::respond(%s)', bytesWritten);
    __ThrowIfNotBYOBRequest(this);
    __ThrowIfNoAssociatedController(this);
    
    return ByteStreamControllerRespond(
      this[__associatedReadableByteStreamController],
      bytesWritten
    );
  }
  
  respondWithNewView(view) {
    __ThrowIfNotBYOBRequest(this);
    __ThrowIfNoAssociatedController(this);
    __ThrowIfNotView(view);
    
    return ByteStreamControllerRespondWithNewView(
      this[__associatedReadableByteStreamController],
      view
    );
  }
}

function __ThrowIfNotBYOBRequest(req) {
  if (IsReadableStreamBYOBRequest(req) === false) {
    throw new TypeError('Not a byob request');
  }
  return req;
}

function __ThrowIfNoAssociatedController(req) {
  assert.ok(typeof req !== 'undefined', 'request is not undefined');
  if (typeof req[__associatedReadableByteStreamController] === 'undefined') {
    throw new TypeError('Request has no associated controller');
  }
  
  return req;
}

function IsReadableStreamBYOBRequest(req) {
  return (isObject(req) &&
          hasInternalSlot(req, __associatedReadableByteStreamController));
}

var rsFixtures = createRSFixtures({
  'symbols': {
    __readableStreamController,
    __closedPromise
  },
  isObject, ensureAssertionThrows,
  IsReadableStream,
  AcquireReadableStreamDefaultReader,
  ReadableStreamDefaultReaderRead,
  ReadableStreamDefaultControllerClose: DefaultControllerClose,
  ReadableStreamDefaultControllerEnqueue: DefaultControllerEnqueue,
  ReadableStreamCancel
});
