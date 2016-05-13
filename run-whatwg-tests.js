const glob = require('glob');
const path = require('path');


import ReadableStreamWHATWG from './whatwg/lib/readable-stream';
import ReadableStream from './lib/ReadableStream';
import WritableStream from './whatwg/lib/writable-stream';
import ByteLengthQueuingStrategy from './whatwg/lib/byte-length-queuing-strategy';
import CountQueuingStrategy from './whatwg/lib/count-queuing-strategy';
import TransformStream from './whatwg/lib/transform-stream';

global.ReadableStream = ReadableStream;
global.WritableStream = WritableStream;
global.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
global.CountQueuingStrategy = CountQueuingStrategy;
global.TransformStream = TransformStream;

const __path = (p) => path.resolve(__dirname, 'whatwg/test/' + p);

if (process.argv.length === 2) {
  //const tests = glob.sync(__path('readable-byte-stream.js'));
  //const tests = glob.sync(__path('*.internal.js'));
  const tests = glob.sync(__path('*.js'));
  
  tests.forEach(require);
} else {
  glob.sync(path.resolve(process.argv[2])).forEach(require);
}
