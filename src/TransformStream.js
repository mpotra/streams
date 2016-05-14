import ReadableStream from './ReadableStream';
import WritableStream from './WritableStream';

/*******************************************************************************
 *
 * WritableStream
 *
 ******************************************************************************/

// Define internal slot property names.
/*
const __writable = Symbol('writable');
const __readable = Symbol('readable');
*/

export default class TransformStream {
  constructor(transformer) {
  
    const flush = (typeof transformer.flush === 'undefined' ?
                    (enqueue, close) => close() :
                    (...args) => transformer.flush(...args));
                    
    if (typeof transformer.transform !== 'function') {
      throw new TypeError('transform must be a function');
    }
    
    const wsController = {};
    const rsController = {};
    
    let chunkWrittenButNotYetTransformed = false;
    let transforming = false;
    let queuedChunk;
    let transformDone;
    
    this['writable'] = new WritableStream({
      start(fnError) {
        wsController.error = fnError;
      },
      
      write(chunk) {
        queuedChunk = chunk;
        chunkWrittenButNotYetTransformed = true;
        
        const p = new Promise((resolve) => transformDone = resolve);
        maybeDoTransform();
        return p;
      },
      
      close() {
        try {
          flush(rsController.enqueue, rsController.close);
        } catch (e) {
          wsController.error(e);
          rsController.error(e);
        }
      }
    }, transformer.writableStrategy);
    
    this['readable'] = new ReadableStream({
      start(controller) {
        __ControllerCloneInto(controller, rsController);
      },
      
      pull() {
        if (chunkWrittenButNotYetTransformed === true) {
          maybeDoTransform();
        }
      }
    }, transformer.readableStrategy);
    
    
    function maybeDoTransform() {
      return maybeTransformChunk(queuedChunk, transformDone);
    }
    
    function maybeTransformChunk(chunk, done) {
      if (transforming === false) {
        transforming = true;
        try {
          //transformer.transform(writeChunk, enqueueInReadable, transformDone);
          transformer.transform(chunk, rsController.enqueue, () => {
            transforming = false;
            done();
          });
          
          queuedChunk = undefined;
          chunkWrittenButNotYetTransformed = false;
        } catch (e) {
          transforming = false;
          wsController.error(e);
          rsController.error(e);
        }
      }
    }
  }
  
  
}

function __ControllerCloneInto(controller, src) {
  const clone = src || {};
  clone.enqueue = controller.enqueue.bind(controller);
  clone.close = controller.close.bind(controller);
  clone.error = controller.error.bind(controller);
  return clone;
}
