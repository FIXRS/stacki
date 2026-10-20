import { useId, useState } from 'react';
import Popup from '../../ui/Popup';
import type { HistoryCommit, HistoryCommitFile } from './historyBridge';
import { ChevronRightIcon, CloseIcon } from '../../ui/Icons';
import FileStatus from '../git/FileStatus';
import HistoryFileDiff from './HistoryFileDiff';

interface HistoryFilesDialogProps {
  readonly commit: HistoryCommit;
  readonly projectPath: string;
  readonly files: readonly HistoryCommitFile[];
  readonly onClose: () => void;
  readonly onRestoreFile: (commit: HistoryCommit, file: HistoryCommitFile) => void;
}

export default function HistoryFilesDialog(props: HistoryFilesDialogProps) {
  const titleId = useId();
  const [selected, setSelected] = useState<HistoryCommitFile | undefined>(undefined);
  return (
    <Popup
      className={`modal history-files-dialog ${selected ? 'with-diff' : ''}`}
      labelledBy={titleId}
      onClose={props.onClose}
    >
      {({ close, finish }) => (
        <>
          <div className="modal-header">
            <h2 id={titleId}>
              {selected ? selected.label : `Changed files (${props.files.length})`}
            </h2>
            <button autoFocus className="ghost" aria-label="Close changed files" onClick={close}>
              <CloseIcon size={16} />
            </button>
          </div>
          <p className="history-files-commit">
            {props.commit.subject} · {props.commit.shortHash}
          </p>
          <HistoryFilesContent
            {...props}
            selected={selected}
            select={setSelected}
            onRestoreFile={(commit, file) =>
              finish(() => {
                props.onClose();
                props.onRestoreFile(commit, file);
              })
            }
          />
        </>
      )}
    </Popup>
  );
}

function HistoryFilesContent({
  selected,
  select,
  ...props
}: HistoryFilesDialogProps & {
  readonly selected: HistoryCommitFile | undefined;
  readonly select: (file: HistoryCommitFile | undefined) => void;
}) {
  if (selected) {
    return (
      <HistoryFileDiff
        key={selected.path}
        projectPath={props.projectPath}
        commit={props.commit}
        file={selected}
        onBack={() => select(undefined)}
        onRestore={() => {
          props.onRestoreFile(props.commit, selected);
        }}
      />
    );
  }
  return (
    <div className="history-files" tabIndex={0} aria-label="Changed files list">
      {props.files.map((file) => (
        <HistoryChangedFile key={file.path} file={file} onOpen={() => select(file)} />
      ))}
    </div>
  );
}

function HistoryChangedFile({
  file,
  onOpen,
}: {
  readonly file: HistoryCommitFile;
  readonly onOpen: () => void;
}) {
  return (
    <button
      className="history-file history-file-open"
      onClick={onOpen}
      aria-label={`View diff for ${file.path}`}
    >
      <FileStatus status={file.status} inCommit />
      <span className="history-file-label">
        <span>{file.label}</span>
        <span className="history-file-path">{file.path}</span>
        {file.from && <span className="history-file-path">From {file.from}</span>}
      </span>
      <ChevronRightIcon size={12} />
    </button>
  );
}
