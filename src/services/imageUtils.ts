
/**
 * Converts ImageData to a float32 array in NCHW format (RGB).
 * Ignores alpha channel.
 * Values normalized to 0-1.
 */
export function imageDataToNCHW(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const float32Data = new Float32Array(3 * width * height);

  // NCHW: RRR...GGG...BBB...
  const channelSize = width * height;

  for (let i = 0; i < channelSize; i++) {
    const r = data[i * 4] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;

    float32Data[i] = r;

    // Use Normalization [0.5, 0.5, 0.5] from Reference Python Code (upscale.py)
    // Formula: (x - mean) / std  => (x - 0.5) / 0.5 => (x * 2) - 1
    // Range: [0, 1] -> [-1, 1]
    float32Data[i] = (r - 0.5) / 0.5;
    float32Data[i + channelSize] = (g - 0.5) / 0.5;
    float32Data[i + 2 * channelSize] = (b - 0.5) / 0.5;
  }

  return float32Data;
}

/**
 * Converts NCHW float32 array back to ImageData.
 * Values assumed to be -1 to 1 (from model output).
 */
export function nchwToImageData(
  data: Float32Array,
  width: number,
  height: number
): ImageData {
  const channelSize = width * height;
  const rgbaData = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < channelSize; i++) {
    // Inverse Normalization: x_norm * std + mean
    // x = x_norm * 0.5 + 0.5
    // Range [-1, 1] -> [0, 1]
    const r_val = data[i] * 0.5 + 0.5;
    const g_val = data[i + channelSize] * 0.5 + 0.5;
    const b_val = data[i + 2 * channelSize] * 0.5 + 0.5;

    const r = Math.min(Math.max(r_val * 255, 0), 255);
    const g = Math.min(Math.max(g_val * 255, 0), 255);
    const b = Math.min(Math.max(b_val * 255, 0), 255);

    rgbaData[i * 4] = r;
    rgbaData[i * 4 + 1] = g;
    rgbaData[i * 4 + 2] = b;
    rgbaData[i * 4 + 3] = 255; // Alpha
  }

  return new ImageData(rgbaData, width, height);
}

/**
 * Creates a linear gradient mask for blending overlaps.
 * Returns NCHW format (3, height, width).
 */
export function createGradientMask(
  height: number,
  width: number,
  hOverlap: number,
  wOverlap: number
): Float32Array {
  const mask = new Float32Array(3 * height * width);
  const channelSize = height * width;

  if (hOverlap <= 0 && wOverlap <= 0) {
    mask.fill(1);
    return mask;
  }

  const getWeight = (pos: number, size: number, ov: number) => {
    if (ov <= 0) return 1;
    if (pos < ov) return pos / ov;
    if (pos >= size - ov) return (size - 1 - pos) / ov;
    return 1;
  };

  for (let y = 0; y < height; y++) {
    const wy = getWeight(y, height, hOverlap);
    for (let x = 0; x < width; x++) {
      const wx = getWeight(x, width, wOverlap);
      const w = wy * wx;

      const idx = y * width + x;
      mask[idx] = w;
      mask[idx + channelSize] = w;
      mask[idx + 2 * channelSize] = w;
    }
  }

  return mask;
}
