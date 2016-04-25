
export class ByteLengthQueuingStrategy {
  constructor({ highWaterMark }) {
    this.highWaterMark = highWaterMark;
  }
  
  size(chunk) {
    return chunk.byteLength;
  }
}


export class CountQueuingStrategy {
  constructor({ highWaterMark }) {
    this.highWaterMark = highWaterMark;
  }
  
  size() {
    return 1;
  }
}
