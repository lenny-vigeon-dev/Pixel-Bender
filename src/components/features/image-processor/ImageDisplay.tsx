import React, { useState } from 'react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import { useTranslation } from 'react-i18next';
import { UpscaleState } from '../../../hooks/useUpscaler';

interface ImageDisplayProps {
  state: UpscaleState;
  liveCanvasRef: React.RefObject<HTMLCanvasElement>;
}

// Shared style for all image/canvas display — fills the available container and letterboxes.
const containStyle: React.CSSProperties = {
  maxWidth: '100%',
  maxHeight: '100%',
  width: 'auto',
  height: 'auto',
  display: 'block',
  objectFit: 'contain',
};

export const ImageDisplay: React.FC<ImageDisplayProps> = ({ state, liveCanvasRef }) => {
  const { t } = useTranslation();
  const [compareOpen, setCompareOpen] = useState(false);

  if (!state.originalImage) return null;

  const isProcessing = state.status === 'processing';
  const isComplete   = state.status === 'complete';
  const isIdle       = state.status === 'idle';

  return (
    <>
      {/* ── Main display panel ── */}
      <div className="flex-1 min-h-0 bg-secondary/5 rounded-lg overflow-hidden relative flex items-center justify-center border border-border">

        {/* Idle: show original */}
        {isIdle && (
          <img
            src={state.originalImage}
            alt="Original"
            className="shadow-lg"
            style={containStyle}
          />
        )}

        {/* Processing: live canvas overlay (always mounted so the ref is stable) */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ visibility: isProcessing ? 'visible' : 'hidden' }}
        >
          <canvas
            ref={liveCanvasRef}
            className="shadow-lg"
            style={containStyle}
          />
        </div>

        {/* Complete: show upscaled image; hover reveals compare prompt */}
        {isComplete && state.resultImage && (
          <div
            className="relative cursor-pointer group w-full h-full flex items-center justify-center"
            onClick={() => setCompareOpen(true)}
          >
            <img
              src={state.resultImage}
              alt="Upscaled"
              className="shadow-lg"
              style={containStyle}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/40 rounded-lg">
              <span className="text-white text-sm font-medium px-4 py-2 bg-black/60 rounded-md shadow">
                {t('click_to_compare')}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Compare modal ── */}
      {compareOpen && state.resultImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setCompareOpen(false)}
        >
          {/* Stop click-inside from closing the modal */}
          <div
            className="relative w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setCompareOpen(false)}
              className="absolute top-2 right-2 z-10 text-white bg-black/60 hover:bg-black/80 rounded-full w-8 h-8 flex items-center justify-center text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>

            {/* Slider — fills available space while keeping the image fully visible */}
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ReactCompareSlider
                itemOne={<ReactCompareSliderImage src={state.originalImage!} alt={t('original')} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />}
                itemTwo={<ReactCompareSliderImage src={state.resultImage}     alt={t('upscaled')} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />}
                style={{
                  width: '100%',
                  height: '100%',
                  maxWidth: '90vw',
                  maxHeight: '90vh',
                }}
                className="rounded-lg shadow-2xl overflow-hidden border border-white/20"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
