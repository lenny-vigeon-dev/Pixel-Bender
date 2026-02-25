import * as ort from 'onnxruntime-web/all';
import { imageDataToNCHW, createGradientMask } from './imageUtils';

// Configure ONNX Runtime to use WASM
ort.env.wasm.wasmPaths = '/';
// Global WebGL Config - Must be set BEFORE loading any model
// @ts-ignore
ort.env.webgl.pack = false;
// @ts-ignore
ort.env.webgl.contextId = 'webgl2';
// @ts-ignore
ort.env.webgl.maxTextureSize = 4096; // Reset to reasonable 4K limit
// @ts-ignore
ort.env.webgl.textureType = 'float'; // Force 32-bit float textures to prevent FP16 overflow (Red/NaN issues)

export type ExecutionProvider = 'wasm' | 'webgl' | 'webgpu';

export interface UpscaleConfig {
  scale: number;
  overlap: number;
  tileSize: number;
  executionProvider: ExecutionProvider;
  batchSize?: number; // Added batch support
  onProgress?: (progress: number, currentBlock: { x: number, y: number, width: number, height: number, data: Float32Array }) => void;
    gap?: number; // new - user controllable min-overlap / gap
}

export class UpscalerService {
  private session: ort.InferenceSession | null = null;
  private currentProvider: ExecutionProvider | null = null;
  private modelPath: string = '/generator_latest.onnx';

  async loadModel(executionProvider: ExecutionProvider = 'webgl') {    // @ts-ignore
    console.log("Global WebGL Config:", { pack: ort.env.webgl.pack, contextId: ort.env.webgl.contextId, maxTextureSize: ort.env.webgl.maxTextureSize });
    if (this.session && this.currentProvider === executionProvider) {
        return;
    }

    try {
        const options: ort.InferenceSession.SessionOptions = {
            executionProviders: [executionProvider],
            graphOptimizationLevel: 'all', // Re-enable optimizations for better memory usage (fusion)
        };

        if (executionProvider === 'webgl') {
             // Model is now static, no overrides needed
        }

        this.session = await ort.InferenceSession.create(this.modelPath, options);
        this.currentProvider = executionProvider;
        console.log(`Model loaded with ${executionProvider}`);

        // Debug Input Metadata
        try {
             if (this.session) {
                console.log('Model Input Names:', this.session.inputNames);
                console.log('Model Output Names:', this.session.outputNames);
             }
        } catch(e) { console.log('Could not inspect input metadata', e); }

    } catch (e) {
        console.error("Failed to load model", e);
        throw e;
    }
  }

  async upscale(imageData: ImageData, config: UpscaleConfig): Promise<ImageData> {
    // Reload if provider changed
    if (!this.session || this.currentProvider !== config.executionProvider) {
      await this.loadModel(config.executionProvider);
    }

    const { width, height } = imageData;
    const { scale, tileSize, overlap } = config;

    const origOutWidth = width * scale;
    const origOutHeight = height * scale;
    let outWidth = origOutWidth;
    let outHeight = origOutHeight;

    // Use gap (min-overlap) if provided, otherwise fall back to overlap
    const gap = config.gap ?? config.overlap ?? overlap;

    // Convert full input to NCHW once
    const inputTensorData = imageDataToNCHW(imageData);

    // Pad input if image is smaller than tileSize (replicate edges)
    let padTop = 0, padBottom = 0, padLeft = 0, padRight = 0;
    let inWidth = width, inHeight = height;
    if (inHeight < tileSize) {
        const padH = tileSize - inHeight;
        padTop = Math.floor(padH / 2);
        padBottom = padH - padTop;
    }
    if (inWidth < tileSize) {
        const padW = tileSize - inWidth;
        padLeft = Math.floor(padW / 2);
        padRight = padW - padLeft;
    }

    const paddedHeight = inHeight + padTop + padBottom;
    const paddedWidth = inWidth + padLeft + padRight;

    // Recompute output buffers for padded dimensions
    const paddedOutWidth = paddedWidth * scale;
    const paddedOutHeight = paddedHeight * scale;
    outWidth = paddedOutWidth;
    outHeight = paddedOutHeight;

    // Output buffers (Accumulator)
    // We use Float32Array for accumulation to handle blending
    const outputBuffer = new Float32Array(3 * outWidth * outHeight);
    const weightBuffer = new Float32Array(3 * outWidth * outHeight);

    let paddedInput: Float32Array;
    if (padTop || padBottom || padLeft || padRight) {
        paddedInput = new Float32Array(3 * paddedWidth * paddedHeight);
        for (let c = 0; c < 3; c++) {
            for (let y = 0; y < paddedHeight; y++) {
                const srcY = Math.min(inHeight - 1, Math.max(0, y - padTop));
                for (let x = 0; x < paddedWidth; x++) {
                    const srcX = Math.min(inWidth - 1, Math.max(0, x - padLeft));
                    const dstIdx = c * (paddedWidth * paddedHeight) + y * paddedWidth + x;
                    const srcIdx = c * (inWidth * inHeight) + srcY * inWidth + srcX;
                    paddedInput[dstIdx] = inputTensorData[srcIdx];
                }
            }
        }
    } else {
        paddedInput = inputTensorData;
    }

    // get_starts function (returns list of start indices)
    const getStarts = (dimension: number, tile: number, minOverlap: number) => {
        if (dimension <= tile) return [0];
        const maxStart = dimension - tile;
        let maxStep = tile - minOverlap;
        if (maxStep <= 0) maxStep = 1;
        const numIntervals = Math.ceil(maxStart / maxStep);
        if (numIntervals === 0) return [0];
        const stepSize = maxStart / numIntervals;
        const starts: number[] = [];
        for (let i = 0; i <= numIntervals; i++) starts.push(Math.round(i * stepSize));
        starts[starts.length - 1] = maxStart;
        return starts;
    };

    const yStarts = getStarts(paddedHeight, tileSize, gap);
    const xStarts = getStarts(paddedWidth, tileSize, gap);

    const h_step_avg = yStarts.length > 1 ? (paddedHeight - tileSize) / (yStarts.length - 1) : 0;
    const w_step_avg = xStarts.length > 1 ? (paddedWidth - tileSize) / (xStarts.length - 1) : 0;

    const h_overlap_actual = yStarts.length > 1 ? Math.floor(tileSize - h_step_avg) : 0;
    const w_overlap_actual = xStarts.length > 1 ? Math.floor(tileSize - w_step_avg) : 0;

    // Total steps
    const totalSteps = yStarts.length * xStarts.length;
    let completedSteps = 0;

    // Batched Processing
    // WebGL often locks input dimensions after the first call or struggles with dynamic shapes.
    // To ensure stability, we default WebGL to batchSize=1.
    // WebGPU can handle larger batches (default 4) for performance specific to that backend.
    const defaultBatchSize = config.executionProvider === 'webgpu' ? 4 : 1;
    let batchSize = config.batchSize || defaultBatchSize;

    // Optimization: Create mask once (will use actual overlaps below)
    const outTileSize = tileSize * scale;
    const mask = createGradientMask(outTileSize, outTileSize, h_overlap_actual * scale, w_overlap_actual * scale);

    // Check mask creation
    if (!mask) console.error("Failed to create gradient mask");

    interface TileRequest {
        yStart: number;
        xStart: number;
        yEnd: number;
        xEnd: number;
        patchData: Float32Array;
        patchWidth: number;
        patchHeight: number;
    }

    let batchQueue: TileRequest[] = [];

    const accumulateTile = (req: TileRequest, tileOutput: Float32Array, tileMask: Float32Array) => {
         const outYStart = req.yStart * scale;
         const outXStart = req.xStart * scale;
         const validOutHeight = req.patchHeight * scale;
         const validOutWidth = req.patchWidth * scale;

         for (let c = 0; c < 3; c++) {
            for (let py = 0; py < validOutHeight; py++) {
                for (let px = 0; px < validOutWidth; px++) {
                    const srcIdx = c * (outTileSize * outTileSize) + py * outTileSize + px;
                    const dstY = outYStart + py;
                    const dstX = outXStart + px;

                    if (dstY >= outHeight || dstX >= outWidth) continue;

                    const dstIdx = c * (outWidth * outHeight) + dstY * outWidth + dstX;
                    const w = tileMask ? tileMask[srcIdx] : mask[srcIdx];
                    const val = tileOutput[srcIdx];

                    outputBuffer[dstIdx] += val * w;
                    weightBuffer[dstIdx] += w;
                }
            }
         }
    };

    const processBatch = async () => {
        if (batchQueue.length === 0 || !this.session) return;

        const currentBatchSize = batchQueue.length;

    try {
        // Combine inputs into one tensor [B, 3, H, W]
        const combinedInput = new Float32Array(currentBatchSize * 3 * tileSize * tileSize);

        for(let i=0; i<currentBatchSize; i++) {
            combinedInput.set(batchQueue[i].patchData, i * 3 * tileSize * tileSize);
        }

        const tensor = new ort.Tensor('float32', combinedInput, [currentBatchSize, 3, tileSize, tileSize]); // [B, 3, H, W]

        const feeds = { [this.session.inputNames[0]]: tensor };
        const results = await this.session.run(feeds);
        const outputTensor = results[this.session.outputNames[0]]; // shape [B, 3, outSize, outSize]

        const outputData = outputTensor.data as Float32Array;

        // Debug: Log first few values of the output to check for explosion/NaN/Redness
        if (completedSteps === 0) {
            console.log("First 10 output values:", outputData.slice(0, 10));
            // Calculate a quick min/max
            let min = Infinity, max = -Infinity;
            for(let k=0; k<Math.min(outputData.length, 1000); k++) {
                if(outputData[k] < min) min = outputData[k];
                if(outputData[k] > max) max = outputData[k];
            }
            console.log("Output Min/Max (first 1000):", min, max);
        }

        const totalOutputPixelsPerTile = 3 * outTileSize * outTileSize;

        // Process results back
        for (let i = 0; i < currentBatchSize; i++) {
                const req = batchQueue[i];
                const tileOutput = outputData.subarray(i * totalOutputPixelsPerTile, (i+1) * totalOutputPixelsPerTile);

                // Per-tile mask copy so we can override edges
                const tileMask = mask.slice();
                const channelSize = outTileSize * outTileSize;
                const hOv = h_overlap_actual * scale;
                const wOv = w_overlap_actual * scale;

                // If this tile touches padded image boundaries, set corresponding mask regions to 1
                if (req.yStart === 0 && hOv > 0) {
                    for (let c = 0; c < 3; c++) {
                        for (let py = 0; py < hOv; py++) {
                            for (let px = 0; px < outTileSize; px++) {
                                const idx = c * channelSize + py * outTileSize + px;
                                tileMask[idx] = 1.0;
                            }
                        }
                    }
                }
                if (req.yEnd === paddedHeight && hOv > 0) {
                    for (let c = 0; c < 3; c++) {
                        for (let py = outTileSize - hOv; py < outTileSize; py++) {
                            for (let px = 0; px < outTileSize; px++) {
                                const idx = c * channelSize + py * outTileSize + px;
                                tileMask[idx] = 1.0;
                            }
                        }
                    }
                }
                if (req.xStart === 0 && wOv > 0) {
                    for (let c = 0; c < 3; c++) {
                        for (let py = 0; py < outTileSize; py++) {
                            for (let px = 0; px < wOv; px++) {
                                const idx = c * channelSize + py * outTileSize + px;
                                tileMask[idx] = 1.0;
                            }
                        }
                    }
                }
                if (req.xEnd === paddedWidth && wOv > 0) {
                    for (let c = 0; c < 3; c++) {
                        for (let py = 0; py < outTileSize; py++) {
                            for (let px = outTileSize - wOv; px < outTileSize; px++) {
                                const idx = c * channelSize + py * outTileSize + px;
                                tileMask[idx] = 1.0;
                            }
                        }
                    }
                }

                accumulateTile(req, tileOutput, tileMask);

                completedSteps++;
                if (config.onProgress) {
                    config.onProgress(completedSteps / totalSteps, {
                        x: (req.xStart - padLeft) * scale,
                        y: (req.yStart - padTop) * scale,
                        width: req.patchWidth * scale,
                        height: req.patchHeight * scale,
                        data: tileOutput,
                    });
                }
        }

    } catch (e: any) {
             console.warn(`Batch inference error (batchSize=${currentBatchSize}). Attempting usage of batchSize=1 fallback.`, e);

             // Fallback detection for WebGL fixed shape issues
             const isShapeMismatch = e.message?.includes("check failed: expected shape") || e.message?.includes("validateInputTensorDims");
             if (this.currentProvider === 'webgl' && isShapeMismatch) {
                 console.warn("Detected WebGL dynamic shape incompatibility. Falling back to WASM for stability.");
                 await this.loadModel('wasm');
                 // config.executionProvider property won't update here but loadModel updates local state
                 // Retry recursively? No, just retry logic inline to avoid recursion hell with batch queue
                 // Actually, if we switch provider, we should restart the whole batch or the whole upscale?
                 // Restarting purely this batch on new provider is safe.
             }

             // If we failed with batch > 1, try processing individually
             if (currentBatchSize > 1 && !this.currentProvider?.includes('wasm')) {
                 batchSize = 1; // Force future batches to be 1 globally for this upscale run
                 console.log("Switched to serial processing (batchSize=1) for stability.");
             }

             // Retry Logic
             for (const req of batchQueue) {
                 try {
                    const tensor = new ort.Tensor('float32', req.patchData, [1, 3, tileSize, tileSize]);
                    const feeds = { [this.session!.inputNames[0]]: tensor }; // session might be new WASM session now
                    const results = await this.session!.run(feeds);
                    const outputData = results[this.session!.outputNames[0]].data as Float32Array;

                    // Build per-tile mask for boundary handling (same logic as above)
                    const tileMask = mask.slice();
                    const channelSize = outTileSize * outTileSize;
                    const hOv = h_overlap_actual * scale;
                    const wOv = w_overlap_actual * scale;

                    if (req.yStart === 0 && hOv > 0) {
                        for (let c = 0; c < 3; c++) {
                            for (let py = 0; py < hOv; py++) {
                                for (let px = 0; px < outTileSize; px++) {
                                    const idx = c * channelSize + py * outTileSize + px;
                                    tileMask[idx] = 1.0;
                                }
                            }
                        }
                    }
                    if (req.yEnd === paddedHeight && hOv > 0) {
                        for (let c = 0; c < 3; c++) {
                            for (let py = outTileSize - hOv; py < outTileSize; py++) {
                                for (let px = 0; px < outTileSize; px++) {
                                    const idx = c * channelSize + py * outTileSize + px;
                                    tileMask[idx] = 1.0;
                                }
                            }
                        }
                    }
                    if (req.xStart === 0 && wOv > 0) {
                        for (let c = 0; c < 3; c++) {
                            for (let py = 0; py < outTileSize; py++) {
                                for (let px = 0; px < wOv; px++) {
                                    const idx = c * channelSize + py * outTileSize + px;
                                    tileMask[idx] = 1.0;
                                }
                            }
                        }
                    }
                    if (req.xEnd === paddedWidth && wOv > 0) {
                        for (let c = 0; c < 3; c++) {
                            for (let py = 0; py < outTileSize; py++) {
                                for (let px = outTileSize - wOv; px < outTileSize; px++) {
                                    const idx = c * channelSize + py * outTileSize + px;
                                    tileMask[idx] = 1.0;
                                }
                            }
                        }
                    }

                    accumulateTile(req, outputData, tileMask);

                    completedSteps++;
                    if (config.onProgress) {
                            config.onProgress(completedSteps / totalSteps, {
                                x: (req.xStart - padLeft) * scale,
                                y: (req.yStart - padTop) * scale,
                                width: req.patchWidth * scale,
                                height: req.patchHeight * scale,
                                data: outputData,
                            });
                    }
                 } catch (innerE) {
                     console.error("Critical: Failed even with batchSize=1", innerE);
                     throw innerE;
                 }
             }
        }


        batchQueue = [];
        await new Promise(r => setTimeout(r, 0));
    };

    // Fill Queue using Python-style starts (handles gaps and padding)
    for (const yStart of yStarts) {
        for (const xStart of xStarts) {
            const yEnd = yStart + tileSize;
            const xEnd = xStart + tileSize;

            const patchHeight = tileSize;
            const patchWidth = tileSize;
            const patchData = new Float32Array(3 * tileSize * tileSize);

            for (let c = 0; c < 3; c++) {
                for (let py = 0; py < tileSize; py++) {
                    for (let px = 0; px < tileSize; px++) {
                        const srcY = yStart + py;
                        const srcX = xStart + px;
                        const srcIdx = c * (paddedWidth * paddedHeight) + srcY * paddedWidth + srcX;
                        const dstIdx = c * (tileSize * tileSize) + py * tileSize + px;
                        patchData[dstIdx] = paddedInput[srcIdx];
                    }
                }
            }

            batchQueue.push({
                yStart, xStart, yEnd, xEnd, patchData, patchHeight, patchWidth
            });

            if (batchQueue.length >= batchSize) {
                await processBatch();
            }
        }
    }

    // Process remaining
    await processBatch();

    // Normalize
    const totalPixels = 3 * outWidth * outHeight;
    for (let i = 0; i < totalPixels; i++) {
        if (weightBuffer[i] > 0) {
            outputBuffer[i] /= weightBuffer[i];
        } else {
             // Handle edge case where weight is 0 (shouldn't happen with proper mask, but safety)
             // Default to gray or black? Or keep 0.
             // If unnormalized, it might be huge or tiny.
        }
    }

    // Crop back to original output size if we padded the input
    let finalBuffer = outputBuffer;
    if (padTop || padLeft || padBottom || padRight) {
        const crop = new Float32Array(3 * origOutWidth * origOutHeight);
        const channelSizeSrc = outWidth * outHeight; // padded out
        const channelSizeDst = origOutWidth * origOutHeight;
        const yOffset = padTop * scale;
        const xOffset = padLeft * scale;

        for (let c = 0; c < 3; c++) {
            for (let y = 0; y < origOutHeight; y++) {
                for (let x = 0; x < origOutWidth; x++) {
                    const dstIdx = c * channelSizeDst + y * origOutWidth + x;
                    const srcY = y + yOffset;
                    const srcX = x + xOffset;
                    const srcIdx = c * channelSizeSrc + srcY * outWidth + srcX;
                    crop[dstIdx] = outputBuffer[srcIdx];
                }
            }
        }
        finalBuffer = crop;
    }

    return this.float32ToImageData(finalBuffer, origOutWidth, origOutHeight);
  }

  private float32ToImageData(data: Float32Array, width: number, height: number): ImageData {
      const rgba = new Uint8ClampedArray(width * height * 4);
      const channelSize = width * height;
      for (let i = 0; i < channelSize; i++) {
          // Inverse correct normalization: [-1, 1] -> [0, 1]
          const r_val = data[i] * 0.5 + 0.5;
          const g_val = data[i + channelSize] * 0.5 + 0.5;
          const b_val = data[i + 2 * channelSize] * 0.5 + 0.5;

          rgba[i * 4] = Math.max(0, Math.min(255, r_val * 255));
          rgba[i * 4 + 1] = Math.max(0, Math.min(255, g_val * 255));
          rgba[i * 4 + 2] = Math.max(0, Math.min(255, b_val * 255));
          rgba[i * 4 + 3] = 255;
      }
      return new ImageData(rgba, width, height);
  }
}

export const upscaler = new UpscalerService();
