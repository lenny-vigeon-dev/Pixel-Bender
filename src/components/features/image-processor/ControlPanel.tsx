import React from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Play, Download, Loader2 } from 'lucide-react';
import { UpscaleState } from '../../../hooks/useUpscaler';

interface ControlPanelProps {
  state: UpscaleState;
  onRun: (config: any) => void;
  onUploadNew: () => void; // Actually this is for the small upload box
  onUploadAnother: (file: File) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ state, onRun, onUploadAnother }) => {
  const { t } = useTranslation();
  const [device, setDevice] = React.useState<'wasm'|'webgl'>('wasm');
  const [gap, setGap] = React.useState<number>(32);

  const handleRun = () => {
    onRun({
      scale: 2,
      executionProvider: device,
      overlap: gap,
      tileSize: 128,
      gap
    });
  };

  const isProcessing = state.status === 'processing';
  const isComplete = state.status === 'complete';

  return (
    <div className="w-full md:w-80 flex flex-col gap-6 p-6 border-l border-border bg-background/50 h-full">

      {/* Small Upload / Upload Another */}
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('uploadAnother')}</label>
        <div className="relative">
             <input
                type="file"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if(file) onUploadAnother(file);
                }}
             />
             <div className="border border-input rounded-md p-3 flex items-center justify-center gap-2 hover:bg-accent transition-colors">
                <Upload className="h-4 w-4" />
                <span className="text-sm">{t('select_image')}</span>
             </div>
        </div>
      </div>

      <div className="h-px bg-border" />

      {/* Options */}
      <div className="space-y-4">
        <div className="space-y-2">
           <label className="text-sm font-medium">{t('device')}</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDevice('wasm')}
                className={`p-2 rounded-md text-xs border ${device === 'wasm' ? 'bg-primary text-primary-foreground border-primary' : 'border-input hover:bg-accent'}`}
                disabled={isProcessing}
              >
                CPU
              </button>

              {/* GPU option is present but currently disabled - show tooltip on hover */}
              <span title={t('coming_soon')} className="w-full block">
                <button
                  onClick={() => setDevice('webgl')}
                  className={`w-full p-2 rounded-md text-xs border opacity-60 cursor-not-allowed ${device === 'webgl' ? 'bg-primary text-primary-foreground border-primary' : 'border-input'}`}
                  disabled={true}
                >
                  GPU
                </button>
              </span>
            </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">{t('gap_label')}</label>
          <input
            type="number"
            min={0}
            max={256}
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            className="w-full bg-background border border-input rounded-md p-2"
            disabled={isProcessing}
          />
          <p className="text-xs text-muted-foreground">{t('overlap_explanation')}</p>
        </div>
      </div>

      {/* Action Button */}
      <button
        onClick={handleRun}
        disabled={isProcessing || !state.originalImage}
        className="w-full py-3 bg-primary text-primary-foreground rounded-md font-medium flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('processing')} {Math.round(state.progress * 100)}%
          </>
        ) : (
          <>
             <Play className="h-4 w-4" />
             {t('run')}
          </>
        )}
      </button>

       {/* Downloads List (Only if history/complete) */}
       {isComplete && (
           <div className="mt-auto pt-6 border-t border-border">
                <h3 className="font-semibold mb-3">{t('downloads')}</h3>
                <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 border border-border rounded-md bg-card">
                        <img src={state.resultImage!} className="w-10 h-10 object-cover rounded-sm" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">upscaled_image.png</p>
                            <p className="text-xs text-muted-foreground">PNG</p>
                        </div>
                        <a
                            href={state.resultImage!}
                            download="upscaled_image.png"
                            className="p-2 hover:bg-accent rounded-md"
                            title={t('download')}
                        >
                            <Download className="h-4 w-4" />
                        </a>
                    </div>
                </div>
           </div>
       )}

    </div>
  );
};
