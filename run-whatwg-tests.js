const glob = require('glob');
const path = require('path');

import ReadableStream from './lib/ReadableStream';
import WritableStream from './lib/WritableStream';
import TransformStream from './lib/TransformStream';
import {ByteLengthQueuingStrategy, CountQueuingStrategy} from './lib/strategy';

global.ReadableStream = ReadableStream;
global.WritableStream = WritableStream;
global.ByteLengthQueuingStrategy = ByteLengthQueuingStrategy;
global.CountQueuingStrategy = CountQueuingStrategy;
global.TransformStream = TransformStream;

const __path = (p) => path.resolve(__dirname, 'whatwg/test/' + p);

if (process.argv.length === 2) {
  const tests = glob.sync(__path('*.js'));
  
  tests.forEach(require);
} else {
  glob.sync(path.resolve(process.argv[2])).forEach(require);
}
