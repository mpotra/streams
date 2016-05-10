import {ReadableStream, test} from '../common';
import testProto from './proto.lib.js';

testProto(new ReadableStream(), test);