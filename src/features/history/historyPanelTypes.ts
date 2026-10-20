import type { ReactNode } from 'react';
import type { IpcResults } from '../../../shared/ipc/ipcResults';
import type { HistoryCommit, HistoryCommitFile } from './historyBridge';

export type HistoryGitInfo = IpcResults['git:info'];

export interface HistoryPanelProps {
  readonly project: { readonly path: string } | undefined;
  readonly gitInfo: HistoryGitInfo | undefined;
  readonly controls: ReactNode;
  readonly previewRef: string | undefined;
  readonly onPreviewCommit: (commit: HistoryCommit) => void;
  readonly onExitPreview: () => void;
  readonly onRestoreFile: (commit: HistoryCommit, file: HistoryCommitFile) => void;
  readonly onRestoreProject: (commit: HistoryCommit) => void;
}
