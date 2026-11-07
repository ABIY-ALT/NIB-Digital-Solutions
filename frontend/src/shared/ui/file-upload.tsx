'use client';

import { FileText, UploadCloud, X } from 'lucide-react';
import { useId, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/shared/lib/cn';
import { formatBytes } from '@/shared/lib/format';
import { Button } from './button';

export interface FileUploadLabels {
  prompt: string;
  browse: string;
  hint?: string;
  remove: string;
  tooLarge: (name: string, max: string) => string;
  badType: (name: string) => string;
  tooMany: (max: number) => string;
}

/**
 * Drag-and-drop file area (keyboard accessible via the browse button).
 * Validates type, size and count on the client; the server must validate again.
 */
export function FileUpload({
  value,
  onChange,
  accept,
  maxSizeBytes = 5 * 1024 * 1024,
  maxFiles = 1,
  disabled,
  labels,
  className,
}: Readonly<{
  value: File[];
  onChange: (files: File[]) => void;
  /** e.g. ".pdf,.png,image/jpeg" */
  accept?: string;
  maxSizeBytes?: number;
  maxFiles?: number;
  disabled?: boolean;
  labels: FileUploadLabels;
  className?: string;
}>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const hintId = useId();

  const accepts = (file: File): boolean => {
    if (!accept) return true;
    return accept.split(',').some((rule) => {
      const r = rule.trim().toLowerCase();
      if (r.startsWith('.')) return file.name.toLowerCase().endsWith(r);
      if (r.endsWith('/*')) return file.type.startsWith(r.slice(0, -1));
      return file.type === r;
    });
  };

  const add = (incoming: FileList | null) => {
    if (!incoming) return;
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(incoming)) {
      if (!accepts(file)) problems.push(labels.badType(file.name));
      else if (file.size > maxSizeBytes)
        problems.push(labels.tooLarge(file.name, formatBytes(maxSizeBytes)));
      else accepted.push(file);
    }
    let next = maxFiles === 1 ? accepted.slice(0, 1) : [...value, ...accepted];
    if (next.length > maxFiles) {
      problems.push(labels.tooMany(maxFiles));
      next = next.slice(0, maxFiles);
    }
    setErrors(problems);
    onChange(next);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) add(e.dataTransfer.files);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-surface border-2 border-dashed border-border-strong bg-surface-muted px-6 py-8 text-center transition-colors',
          dragging && 'border-primary bg-primary-softer',
          disabled && 'opacity-60',
        )}
      >
        <UploadCloud className="size-9 text-subtle-foreground" aria-hidden />
        <p className="text-sm font-medium">{labels.prompt}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          aria-describedby={hintId}
        >
          {labels.browse}
        </Button>
        <p id={hintId} className="text-xs text-muted-foreground">
          {labels.hint}
        </p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          accept={accept}
          multiple={maxFiles > 1}
          disabled={disabled}
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {errors.length ? (
        <ul role="alert" className="space-y-0.5 text-xs text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {value.length ? (
        <ul className="divide-y divide-border rounded-control border border-border bg-surface">
          {value.map((file, i) => (
            <li key={`${file.name}-${i}`} className="flex items-center gap-3 px-3 py-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <span className="text-xs text-muted-foreground tabular">
                {formatBytes(file.size)}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${labels.remove} ${file.name}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
