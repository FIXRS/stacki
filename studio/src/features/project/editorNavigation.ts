import { useEffect, useState } from 'react';
import { useEditorRole } from '../roles/useEditorRole';
import type { Peer } from '../collaboration/presence';
import type { FollowTarget } from '../collaboration/useCollaborators';
import { clearAssetRequest, getPendingAsset } from '../../../vendor/stacki/src/ui/assetPick';

export interface ComponentFocus {
  readonly path: string;
  readonly occurrence: number;
}
export type OpenFile = (file: string, focus?: ComponentFocus) => void;

export function useEditorNavigation() {
  const role = useEditorRole();
  const [file, setFile] = useState('src/pages/index.astro');
  const [previewFile, setPreviewFile] = useState(file);
  const [focus, setFocus] = useState<ComponentFocus>();
  const [followTarget, setFollowTarget] = useState<FollowTarget>();
  useEffect(() => {
    if (role === 'client' && file.endsWith('.astro') && !file.startsWith('src/pages/')) {
      setFile(previewFile);
      setFocus(undefined);
      setFollowTarget(undefined);
    }
  }, [role, file, previewFile]);
  const open: OpenFile = (file, focus) => {
    if (role === 'client' && file.endsWith('.astro') && !file.startsWith('src/pages/')) {
      return;
    }
    clearPendingAsset();
    setFollowTarget(undefined);
    setFocus(focus);
    setFile(file);
    if (isCanvasPage(file)) {
      setPreviewFile(file);
    }
  };
  const follow = (peer: Peer) => {
    if (role === 'client' && peer.file.endsWith('.astro') && !peer.file.startsWith('src/pages/')) {
      return;
    }
    clearPendingAsset();
    setFocus(undefined);
    setFile(peer.file);
    setPreviewFile(peer.page);
    setFollowTarget({ ...peer, request: Date.now() });
  };
  return { file, previewFile, focus, followTarget, open, follow };
}
function clearPendingAsset() {
  if (getPendingAsset()) {
    clearAssetRequest();
  }
}
import { isCanvasPage } from '../../../vendor/stacki/shared/properties/defaultsCanvas';
