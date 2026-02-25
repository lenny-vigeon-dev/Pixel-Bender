import React from 'react';
import { useUpscaler } from '../../hooks/useUpscaler';
import { UploadZone } from './image-processor/UploadZone';
import { ControlPanel } from './image-processor/ControlPanel';
import { ImageDisplay } from './image-processor/ImageDisplay';
import { AlertCircle } from 'lucide-react';

export const ImageProcessor: React.FC = () => {
  const {
    status,
    progress,
    originalImage,
    resultImage,
    error,
    setOriginalImage,
    runUpscale,
    liveCanvasRef
  } = useUpscaler();

  if (!originalImage) {
    return (
      <div className="w-full max-w-4xl mx-auto py-12">
        <UploadZone onImageSelect={setOriginalImage} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">

      {error && (
        <div className="bg-destructive/15 text-destructive p-4 rounded-md flex items-center gap-2 border border-destructive/20">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 h-[800px] border border-border rounded-xl overflow-hidden shadow-sm bg-card">

        {/* Main Image Area */}
        <div className="flex-1 p-4 bg-secondary/5 flex flex-col min-w-0">
          <ImageDisplay
             state={{ status, progress, originalImage, resultImage, error }}
             liveCanvasRef={liveCanvasRef}
          />
        </div>

        {/* Sidebar */}
        <ControlPanel
          state={{ status, progress, originalImage, resultImage, error }}
          onRun={runUpscale}
          onUploadNew={() => {}}
          onUploadAnother={setOriginalImage}
        />

        {/* If we strictly followed "On the right side of the side bar... another column",
            we would add another div here.
            But putting it inside ControlPanel is cleaner for this layout.
            If the user insists on 3 columns, we can split ControlPanel.
        */}
      </div>
    </div>
  );
};
