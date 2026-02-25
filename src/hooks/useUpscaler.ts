import { useState, useCallback, useRef } from 'react';
import { upscaler, UpscaleConfig } from '../services/upscaler';

export interface UpscaleState {
  status: 'idle' | 'processing' | 'complete' | 'error';
  progress: number;
  originalImage: string | null;
  resultImage: string | null;
  error: string | null;
}

export function useUpscaler() {
  const [state, setState] = useState<UpscaleState>({
    status: 'idle',
    progress: 0,
    originalImage: null,
    resultImage: null,
    error: null,
  });

  // Use a ref for the live canvas to update it without re-renders if possible
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const fileRef = useRef<File | null>(null);

  const setOriginalImage = useCallback((file: File) => {
    fileRef.current = file;
    const url = URL.createObjectURL(file);
    setState(prev => ({ ...prev, originalImage: url, status: 'idle', resultImage: null, progress: 0 }));
  }, []);

  const runUpscale = useCallback(async (config: Omit<UpscaleConfig, 'onProgress'>) => {
    if (!fileRef.current) return;
    const file = fileRef.current;

    try {
      setState(prev => ({ ...prev, status: 'processing', progress: 0, error: null }));

      // Load image
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve) => { img.onload = resolve; });
      const { width, height } = img;

      // Draw to canvas to get ImageData
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, width, height);

      // Prepare live canvas if available
      if (liveCanvasRef.current) {
          const outW = width * config.scale;
          const outH = height * config.scale;
          liveCanvasRef.current.width = outW;
          liveCanvasRef.current.height = outH;
          // Set aspect-ratio so CSS max-width/max-height both scale proportionally
          liveCanvasRef.current.style.aspectRatio = `${outW} / ${outH}`;
          const liveCtx = liveCanvasRef.current.getContext('2d');

          if (liveCtx) {
            liveCtx.imageSmoothingEnabled = false;
            liveCtx.drawImage(img, 0, 0, outW, outH);
          }
      }

      await upscaler.loadModel(config.executionProvider);

      const resultImageData = await upscaler.upscale(imageData, {
        ...config,
        onProgress: (progress, block) => {
            setState(prev => ({ ...prev, progress }));

            if (liveCanvasRef.current) {
                const liveCtx = liveCanvasRef.current.getContext('2d');
                if (liveCtx) {
                    const { x, y, width: w, height: h, data } = block;

                    const tileStride = Math.sqrt(data.length / 3);
                    const patchData = new Uint8ClampedArray(w * h * 4);

                    // Model outputs are in [-1, 1]. Inverse-normalize: val * 0.5 + 0.5 -> [0, 1] -> * 255
                    for(let py=0; py<h; py++) {
                        for(let px=0; px<w; px++) {
                            const srcIdx = py * tileStride + px;
                            const r = data[srcIdx] * 0.5 + 0.5;
                            const g = data[srcIdx + tileStride*tileStride] * 0.5 + 0.5;
                            const b = data[srcIdx + 2*tileStride*tileStride] * 0.5 + 0.5;

                            const dstIdx = (py * w + px) * 4;
                            patchData[dstIdx]   = Math.min(255, Math.max(0, r * 255));
                            patchData[dstIdx+1] = Math.min(255, Math.max(0, g * 255));
                            patchData[dstIdx+2] = Math.min(255, Math.max(0, b * 255));
                            patchData[dstIdx+3] = 255;
                        }
                    }
                    const patchImage = new ImageData(patchData, w, h);
                    liveCtx.putImageData(patchImage, x, y);
                }
            }
        }
      });

      // Final canvas to blob/url
      const outCanvas = document.createElement('canvas');
      outCanvas.width = resultImageData.width;
      outCanvas.height = resultImageData.height;
      const outCtx = outCanvas.getContext('2d');
      if (outCtx) {
          outCtx.putImageData(resultImageData, 0, 0);
          const resultUrl = outCanvas.toDataURL('image/png');

          setState(prev => ({
            ...prev,
            status: 'complete',
            resultImage: resultUrl,
            progress: 1
          }));
      }

    } catch (err) {
      console.error(err);
      setState(prev => ({ ...prev, status: 'error', error: 'Failed to process image' }));
    }
  }, []);

  return {
    ...state,
    setOriginalImage,
    runUpscale,
    liveCanvasRef
  };
}
