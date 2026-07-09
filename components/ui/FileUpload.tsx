'use client';

import { cn } from '@/lib/utils/cn';
import { useRef, DragEvent, ChangeEvent, ReactNode } from 'react';
import { useTranslations } from 'next-intl';

export interface FileUploadProps {
  accept?: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
}

export default function FileUpload({
  accept = 'image/*',
  multiple = false,
  onFilesSelected,
  children,
  className,
  disabled = false,
}: FileUploadProps) {
  const t = useTranslations('ui.fileUpload');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    if (!disabled && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div
      onClick={handleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        'cursor-pointer rounded-lg border-2 border-dashed border-stroke bg-muted/50',
        'p-6 text-center transition-colors hover:border-brand-primary hover:bg-brand-primary-light/10',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />
      {children || (
        <>
          <svg className="mx-auto h-10 w-10 text-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="mt-2 text-sm font-medium text-foreground">
            {t('title')}
          </p>
          <p className="mt-1 text-xs text-secondary">
            {t('subtitle')}
          </p>
        </>
      )}
    </div>
  );
}

export { FileUpload };