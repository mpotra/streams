const assert = require('assert');

export default function (ctx) {

  const symbols = ctx.symbols;
  
  const typeIsObject = ctx.isObject;
  
  const rethrowAssertionErrorRejection = (e) => {
    return ctx.ensureAssertionThrows.apply(null, arguments);
  };
  
  //const rethrowAssertionErrorRejection = ctx.ensureAssertionThrows;
  const IsReadableStream = ctx.IsReadableStream;
  const AcquireReadableStreamDefaultReader = ctx.AcquireReadableStreamDefaultReader;
  const ReadableStreamDefaultReaderRead = ctx.ReadableStreamDefaultReaderRead;
  const ReadableStreamDefaultControllerClose = ctx.ReadableStreamDefaultControllerClose;
  const ReadableStreamDefaultControllerEnqueue = ctx.ReadableStreamDefaultControllerEnqueue;
  const ReadableStreamCancel = ctx.ReadableStreamCancel;
  const createArrayFromList = (list) => list.slice(0);
  const createDataProperty = (o, p, v) => o[p] = v;

  const methods = {
    pipeTo(dest, { preventClose, preventAbort, preventCancel } = {}) {
      preventClose = Boolean(preventClose);
      preventAbort = Boolean(preventAbort);
      preventCancel = Boolean(preventCancel);

      const source = this;

      let reader;
      let lastRead;
      let lastWrite;
      let closedPurposefully = false;
      let resolvePipeToPromise;
      let rejectPipeToPromise;

      return new Promise((resolve, reject) => {
        resolvePipeToPromise = resolve;
        rejectPipeToPromise = reject;

        reader = source.getReader();
        
        reader.closed.catch(abortDest);
        dest.closed.then(
          () => {
            if (!closedPurposefully) {
              cancelSource(new TypeError('destination is closing or closed and cannot be piped to anymore'));
            }
          },
          cancelSource
        );

        doPipe();
      });

      function doPipe() {
        lastRead = reader.read();

        Promise.all([lastRead, dest.ready]).then(([{ value, done }]) => {
          if (Boolean(done) === true) {
            closeDest();
          } else if (dest.state === 'writable') {
            lastWrite = dest.write(value);
            doPipe();
          }
        })
        .catch(rethrowAssertionErrorRejection);

        // Any failures will be handled by listening to reader.closed and dest.closed above.
        // TODO: handle malicious dest.write/dest.close?
      }

      function cancelSource(reason) {
        if (preventCancel === false) {
          reader.cancel(reason);
          reader.releaseLock();
          rejectPipeToPromise(reason);
        } else {
          // If we don't cancel, we need to wait for lastRead to finish before we're allowed to release.
          // We don't need to handle lastRead failing because that will trigger abortDest which takes care of
          // both of these.
          lastRead.then(() => {
            reader.releaseLock();
            rejectPipeToPromise(reason);
          });
        }
      }

      function closeDest() {
        // Does not need to wait for lastRead since it occurs only on source closed.
        
        reader.releaseLock();

        const destState = dest.state;
        if (preventClose === false && (destState === 'waiting' || destState === 'writable')) {
          closedPurposefully = true;
          dest.close().then(resolvePipeToPromise, rejectPipeToPromise);
        } else if (lastWrite !== undefined) {
          lastWrite.then(resolvePipeToPromise, rejectPipeToPromise);
        } else {
          resolvePipeToPromise();
        }
      }

      function abortDest(reason) {
        // Does not need to wait for lastRead since it only occurs on source errored.

        reader.releaseLock();

        if (preventAbort === false) {
          dest.abort(reason);
        }
        rejectPipeToPromise(reason);
      }
    },

    tee() {
      if (IsReadableStream(this) === false) {
        throw new TypeError('ReadableStream.prototype.tee can only be used on a ReadableStream');
      }

      const branches = ReadableStreamTee(this, false);
      return createArrayFromList(branches);
    }
  };


function ReadableStreamTee(stream, shouldClone) {
  assert(IsReadableStream(stream) === true);
  assert(typeof shouldClone === 'boolean');

  const reader = AcquireReadableStreamDefaultReader(stream);

  const teeState = {
    closedOrErrored: false,
    canceled1: false,
    canceled2: false,
    reason1: undefined,
    reason2: undefined
  };
  teeState.promise = new Promise(resolve => teeState._resolve = resolve);

  const pull = create_ReadableStreamTeePullFunction();
  pull._reader = reader;
  pull._teeState = teeState;
  pull._shouldClone = shouldClone;

  const cancel1 = create_ReadableStreamTeeBranch1CancelFunction();
  cancel1._stream = stream;
  cancel1._teeState = teeState;

  const cancel2 = create_ReadableStreamTeeBranch2CancelFunction();
  cancel2._stream = stream;
  cancel2._teeState = teeState;

  const underlyingSource1 = Object.create(Object.prototype);
  createDataProperty(underlyingSource1, 'pull', pull);
  createDataProperty(underlyingSource1, 'cancel', cancel1);
  const branch1Stream = new ReadableStream(underlyingSource1);

  const underlyingSource2 = Object.create(Object.prototype);
  createDataProperty(underlyingSource2, 'pull', pull);
  createDataProperty(underlyingSource2, 'cancel', cancel2);
  const branch2Stream = new ReadableStream(underlyingSource2);

  //pull._branch1 = branch1Stream._readableStreamController;
  //pull._branch2 = branch2Stream._readableStreamController;
  pull._branch1 = branch1Stream[symbols.__readableStreamController];
  pull._branch2 = branch2Stream[symbols.__readableStreamController];

  reader[symbols.__closedPromise].catch(r => {
    if (teeState.closedOrErrored === true) {
      return undefined;
    }

    ReadableStreamDefaultControllerError(pull._branch1, r);
    ReadableStreamDefaultControllerError(pull._branch2, r);
    teeState.closedOrErrored = true;
  });

  return [branch1Stream, branch2Stream];
}

function create_ReadableStreamTeePullFunction() {
  const f = () => {
    const { _reader: reader, _branch1: branch1, _branch2: branch2, _teeState: teeState,
            _shouldClone: shouldClone } = f;

    return ReadableStreamDefaultReaderRead(reader).then(result => {
      assert(typeIsObject(result));
      const value = result.value;
      const done = result.done;
      assert(typeof done === "boolean");

      if (done === true && teeState.closedOrErrored === false) {
        if (teeState.canceled1 === false) {
          ReadableStreamDefaultControllerClose(branch1);
        }
        if (teeState.canceled2 === false) {
          ReadableStreamDefaultControllerClose(branch2);
        }
        teeState.closedOrErrored = true;
      }

      if (teeState.closedOrErrored === true) {
        return undefined;
      }

      // There is no way to access the cloning code right now in the reference implementation.
      // If we add one then we'll need an implementation for StructuredClone.


      if (teeState.canceled1 === false) {
        let value1 = value;
//        if (shouldClone === true) {
//          value1 = StructuredClone(value);
//        }
        ReadableStreamDefaultControllerEnqueue(branch1, value1);
      }

      if (teeState.canceled2 === false) {
        let value2 = value;
//        if (shouldClone === true) {
//          value2 = StructuredClone(value);
//        }
        ReadableStreamDefaultControllerEnqueue(branch2, value2);
      }
    });
  };
  return f;
}

function create_ReadableStreamTeeBranch1CancelFunction() {
  const f = reason => {
    const { _stream: stream, _teeState: teeState } = f;

    teeState.canceled1 = true;
    teeState.reason1 = reason;
    if (teeState.canceled2 === true) {
      const compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

function create_ReadableStreamTeeBranch2CancelFunction() {
  const f = reason => {
    const { _stream: stream, _teeState: teeState } = f;

    teeState.canceled2 = true;
    teeState.reason2 = reason;
    if (teeState.canceled1 === true) {
      const compositeReason = createArrayFromList([teeState.reason1, teeState.reason2]);
      const cancelResult = ReadableStreamCancel(stream, compositeReason);
      teeState._resolve(cancelResult);
    }
    return teeState.promise;
  };
  return f;
}

  return methods;
}
