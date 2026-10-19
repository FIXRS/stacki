import { canConvertAssets } from '../../ipc/editorEnvironment';
import { useEffect, useRef, useState } from 'react';
import { IMAGE_BATCH_MAX, type ImageFormat } from '../../../shared/ipc/assetConversion';
import { confirmDialog } from '../../ui/ConfirmDialog';
import { convertAsset, deleteAsset } from './assetPanelBridge';
import type { AssetFile } from './assetPaths';

export function useAssetBatch(
  projectPath: string,
  showToast: (message: string, kind: 'error') => void,
) {
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<string>();
  const running = useRef(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const toggle = (rel: string) =>
    setSelected((previous) => {
      if (previous.has(rel)) {
        return new Set([...previous].filter((item) => item !== rel));
      }
      if (previous.size >= IMAGE_BATCH_MAX) {
        return previous;
      }
      return new Set([...previous, rel]);
    });
  const run = async (files: readonly AssetFile[], operation: ImageFormat | 'delete') => {
    if (running.current || files.length === 0) {
      return;
    }
    if (files.length > IMAGE_BATCH_MAX) {
      showToast('Select at most 100 files.', 'error');
      return;
    }
    running.current = true;
    try {
      const confirmed = await confirmAssetBatch(files.length, operation);
      if (!confirmed || !active.current) {
        return;
      }
      for (const [index, file] of files.entries()) {
        setProgress(`${index + 1} of ${files.length} · ${file.name}`);
        const result =
          operation === 'delete'
            ? await deleteAsset(projectPath, file.rel)
            : await convertAsset(projectPath, file.rel, operation);
        if (!active.current) {
          return;
        }
        if (!result.ok) {
          showToast(`${file.name}: ${result.error}`, 'error');
          break;
        }
        setSelected((previous) => new Set([...previous].filter((item) => item !== file.rel)));
      }
    } finally {
      setProgress(undefined);
      running.current = false;
    }
  };
  return { selecting, setSelecting, selected, setSelected, progress, toggle, run };
}
export type AssetBatch = ReturnType<typeof useAssetBatch>;
export function convertible(file: AssetFile): boolean {
  return canConvertAssets && /\.(png|jpe?g|webp|avif|tiff?)$/i.test(file.name);
}

export function AssetBatchTools({
  batch,
  files,
}: {
  readonly batch: AssetBatch;
  readonly files: readonly AssetFile[];
}) {
  const selected = files.filter((file) => batch.selected.has(file.rel));
  const busy = batch.progress !== undefined;
  return (
    <div className="asset-batch-tools">
      <button
        disabled={busy}
        onClick={() => {
          batch.setSelecting(!batch.selecting);
          batch.setSelected(new Set());
        }}
      >
        {batch.selecting ? 'Done selecting' : 'Select assets'}
      </button>
      {batch.selecting && (
        <>
          <button
            disabled={busy || files.length > IMAGE_BATCH_MAX}
            onClick={() => batch.setSelected(new Set(files.map((file) => file.rel)))}
          >
            Select all
          </button>
          <span>
            {selected.length} selected · up to {IMAGE_BATCH_MAX}
          </span>
          {canConvertAssets &&
            (['webp', 'avif'] as const).map((format) => (
              <button
                key={format}
                disabled={
                  busy ||
                  selected.length === 0 ||
                  selected.some((file) => !convertible(file)) ||
                  selected.every((file) => file.name.toLowerCase().endsWith('.' + format))
                }
                onClick={() =>
                  void batch.run(
                    selected.filter((file) => !file.name.toLowerCase().endsWith('.' + format)),
                    format,
                  )
                }
              >
                Convert to {format.toUpperCase()}
              </button>
            ))}
          <button
            disabled={busy || selected.length === 0}
            onClick={() => void batch.run(selected, 'delete')}
          >
            Delete selected
          </button>
        </>
      )}
      {batch.progress && (
        <div role="status">
          <span className="mini-spinner" /> {batch.progress}
        </div>
      )}
    </div>
  );
}

function confirmAssetBatch(count: number, operation: ImageFormat | 'delete') {
  return confirmDialog({
    title: operation === 'delete' ? `Delete ${count} assets?` : `Convert ${count} images?`,
    body:
      operation === 'delete'
        ? 'Moves selected assets to the trash. Site references are kept.'
        : `Converts to ${operation.toUpperCase()} at 95% size and quality. ` +
          'Updates site references and moves originals to the trash. ' +
          'Existing output files are never overwritten.',
    confirmLabel: operation === 'delete' ? 'Delete' : 'Convert',
    danger: operation === 'delete',
  });
}
