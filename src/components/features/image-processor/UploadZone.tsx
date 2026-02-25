import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';

interface UploadZoneProps {
  onImageSelect: (file: File) => void;
  className?: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onImageSelect, className }) => {
  const { t } = useTranslation();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onImageSelect(acceptedFiles[0]);
    }
  }, [onImageSelect]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp']
    },
    multiple: false
  });

  return (
    <div
      {...getRootProps()}
      className={clsx(
        "border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-colors min-h-[400px]",
        isDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-muted/50",
        className
      )}
    >
      <input {...getInputProps()} />
      <UploadCloud className={clsx("h-16 w-16 mb-4", isDragActive ? "text-primary" : "text-muted-foreground")} />
      <p className="text-xl font-medium text-foreground">
        {t('dragDrop')}
      </p>
      <p className="text-sm text-muted-foreground mt-2">
        PNG, JPG, WEBP
      </p>
    </div>
  );
};
