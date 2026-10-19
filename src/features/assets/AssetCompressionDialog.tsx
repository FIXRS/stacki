import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ImageFormat } from '../../../shared/ipc/assetConversion';
import { CloseIcon } from '../../ui/Icons';
import type { AssetFile } from './assetPaths';

export default function AssetCompressionDialog({
  files,
  onClose,
  onCompress,
}: {
  readonly files: readonly AssetFile[];
  readonly onClose: () => void;
  readonly onCompress: (files: readonly AssetFile[], format: ImageFormat) => void;
}) {
  const [format, setFormat] = useState<ImageFormat>('avif');
  const titleId = useId();
  const dialogRef = useCompressionFocus(onClose);
  const targets = files.filter((file) => !file.name.toLowerCase().endsWith('.' + format));
  const skipped = files.length - targets.length;
  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="modal asset-compression-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-header">
          <h2 id={titleId}>
            Compress {files.length} {files.length === 1 ? 'image' : 'images'}
          </h2>
          <button className="ghost" aria-label="Close compression dialog" onClick={onClose}>
            <CloseIcon size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p>
            Resize to 95% and convert at 95% quality. Site references update automatically, and
            originals move to Trash after success.
          </p>
          <CompressionFormats format={format} setFormat={setFormat} />
          {skipped > 0 && (
            <p className="hint-text">{skipped} already in this format will be skipped.</p>
          )}
        </div>
        <div className="modal-footer">
          <button autoFocus onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={targets.length === 0}
            onClick={() => onCompress(targets, format)}
          >
            Compress
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CompressionFormats({
  format,
  setFormat,
}: {
  readonly format: ImageFormat;
  readonly setFormat: (format: ImageFormat) => void;
}) {
  const radioName = useId();
  return (
    <fieldset>
      <legend>Select a file format</legend>
      {(['avif', 'webp'] as const).map((value) => (
        <label key={value}>
          <input
            type="radio"
            name={radioName}
            value={value}
            checked={format === value}
            onChange={() => setFormat(value)}
          />
          {value === 'avif' ? 'AVIF' : 'WebP'}
        </label>
      ))}
    </fieldset>
  );
}

function useCompressionFocus(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const dialog = dialogRef.current;
      if (!dialog) {
        return;
      }
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'Tab') {
        // This dialog has at most four tab stops: close, format, cancel, compress.
        const controls = dialog.querySelectorAll<HTMLElement>('button:enabled, input:checked');
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return dialogRef;
}
