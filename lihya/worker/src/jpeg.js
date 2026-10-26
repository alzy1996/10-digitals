// JPEG checks without an image library: the magic bytes and the frame size
// from the first SOF (start of frame) marker. Segments before the frame
// (APP0 JFIF, APP1 Exif with its own thumbnail, DQT, DHT...) are skipped by
// their length, so an Exif thumbnail is never mistaken for the image.

// SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

/** True when the bytes start with a JPEG SOI marker followed by another marker. */
export function isJpeg(bytes) {
  return bytes instanceof Uint8Array && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Frame size of a baseline or progressive JPEG.
 * @param {Uint8Array} bytes
 * @returns {{ width: number, height: number, marker: number } | null} null when not a readable JPEG
 */
export function jpegSize(bytes) {
  if (!isJpeg(bytes)) return null;
  const n = bytes.length;
  let i = 2;
  while (i < n) {
    if (bytes[i] !== 0xff) return null;
    while (i < n && bytes[i] === 0xff) i += 1; // fill bytes
    if (i >= n) return null;
    const marker = bytes[i];
    i += 1;
    // Markers without a length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    // End of image or start of scan before any frame header: not a usable JPEG.
    if (marker === 0xd9 || marker === 0xda || marker === 0x00) return null;
    if (i + 2 > n) return null;
    const length = (bytes[i] << 8) | bytes[i + 1];
    if (length < 2) return null;
    if (SOF_MARKERS.has(marker)) {
      // length(2) precision(1) height(2) width(2) components(1)
      if (length < 8 || i + 7 > n) return null;
      const height = (bytes[i + 3] << 8) | bytes[i + 4];
      const width = (bytes[i + 5] << 8) | bytes[i + 6];
      if (width === 0 || height === 0) return null;
      return { width, height, marker };
    }
    i += length;
  }
  return null;
}
