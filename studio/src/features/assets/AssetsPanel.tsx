import { useAssetHistory } from './useAssetHistory';
import { useCallback, useEffect } from 'react';
import StackiAssetsPanel from '../../../vendor/stacki/src/features/assets/AssetsPanel';
import { ConfirmHost } from '../../../vendor/stacki/src/ui/ConfirmDialog';
import { clearAssetRequest, type AssetRequest } from '../../../vendor/stacki/src/ui/assetPick';
import type { Project } from '../project/projectClient';

interface Props {
  readonly project: Project;
  readonly refresh: () => void;
  readonly error: (error: unknown) => void;
  readonly pick: AssetRequest | undefined;
}
export function AssetsPanel({ refresh, error, pick }: Props) {
  const recordUndo = useAssetHistory(error);
  const showToast = useCallback((message: string) => error(new Error(message)), [error]);
  useEffect(() => {
    window.addEventListener('studio:assets-changed', refresh);
    return () => window.removeEventListener('studio:assets-changed', refresh);
  }, [refresh]);
  return (
    <>
      <StackiAssetsPanel
        project={{ path: 'studio' }}
        showToast={showToast}
        onRecordUndo={recordUndo}
        pick={
          pick && {
            ...pick,
            onPick: (file, entry) => {
              pick.onPick(file, entry);
              clearAssetRequest();
            },
          }
        }
        onPickCancel={clearAssetRequest}
      />
      <ConfirmHost />
    </>
  );
}
