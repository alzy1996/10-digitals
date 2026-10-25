import { describe, expect, it } from 'vitest';
import { isJpeg, jpegSize } from '../src/jpeg.js';
import { jpegBytes, PNG_BYTES } from './helpers.js';

describe('jpegSize', () => {
  it('reads a baseline frame size', () => {
    expect(jpegSize(jpegBytes(504, 504))).toEqual({ width: 504, height: 504, marker: 0xc0 });
    expect(jpegSize(jpegBytes(511, 300))).toEqual({ width: 511, height: 300, marker: 0xc0 });
  });

  it('reads a progressive frame size', () => {
    expect(jpegSize(jpegBytes(400, 320, { sof: 0xc2 }))).toEqual({ width: 400, height: 320, marker: 0xc2 });
  });

  it('skips an Exif thumbnail and fill bytes', () => {
    const bytes = jpegBytes(480, 360, { exifThumb: { width: 4000, height: 3000 }, fill: true });
    expect(jpegSize(bytes)).toEqual({ width: 480, height: 360, marker: 0xc0 });
  });

  it('reports large frames as they are (the caller rejects them)', () => {
    expect(jpegSize(jpegBytes(1024, 820))).toMatchObject({ width: 1024, height: 820 });
  });

  it('refuses non-JPEG and broken data', () => {
    expect(isJpeg(PNG_BYTES)).toBe(false);
    expect(jpegSize(PNG_BYTES)).toBeNull();
    expect(jpegSize(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(jpegSize(jpegBytes(504, 504).slice(0, 30))).toBeNull();
    expect(jpegSize('not bytes')).toBeNull();
  });

  it('refuses a scan before any frame header', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
    expect(jpegSize(bytes)).toBeNull();
  });

  it('refuses a frame with zero height (DNL) and a DHT marker is not a frame', () => {
    expect(jpegSize(jpegBytes(504, 0))).toBeNull();
    const dhtOnly = new Uint8Array([0xff, 0xd8, 0xff, 0xc4, 0x00, 0x08, 0x00, 0x01, 0xf4, 0x01, 0xf4, 0x00, 0xff, 0xd9]);
    expect(jpegSize(dhtOnly)).toBeNull();
  });
});
