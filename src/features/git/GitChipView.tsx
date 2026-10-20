import React from 'react';
import type { WireGitInfo } from '../../../shared/ipc/ipcResults';
import { branchNameError, sanitizeBranchName } from './branchName';
import BranchActions from './BranchActions';
import type FileBrowser from './FileBrowser';
import CommitFilePicker from './CommitFilePicker';
import { BranchIcon, CheckIcon, CloseIcon, ExternalIcon } from '../../ui/Icons';
import { repoSlug, webUrl } from './gitPublish';
import Tooltip from '../../ui/Tooltip';

type ChangedFiles = React.ComponentProps<typeof FileBrowser>['files'];

interface GitChipViewProps {
  readonly info: WireGitInfo;
  readonly busy: string | undefined;
  readonly error: string | undefined;
  readonly commitMessage: string;
  readonly newBranch: string;
  readonly picking: boolean;
  readonly picked: readonly string[] | undefined;
  readonly changed: ChangedFiles;
  readonly onDismissError: () => void;
  readonly onSwitch: (branch: string) => void;
  readonly onMerge: (branch: string) => void;
  readonly onDelete: (branch: string) => void;
  readonly onNewBranch: (value: string) => void;
  readonly onCreateBranch: (branch: string) => void;
  readonly onCommitMessage: (value: string) => void;
  readonly onRefreshFiles: () => void;
  readonly onTogglePicking: () => void;
  readonly onPick: (paths: readonly string[]) => void;
  readonly onCommit: () => void;
  readonly onOpenRemote: (remote: string) => void;
  readonly onPush: () => void;
  readonly onPublish: () => void;
}

interface BranchesProps {
  readonly info: WireGitInfo;
  readonly working: boolean;
  readonly newBranch: string;
  readonly onSwitch: (branch: string) => void;
  readonly onMerge: (branch: string) => void;
  readonly onDelete: (branch: string) => void;
  readonly onNewBranch: (value: string) => void;
  readonly onCreateBranch: (branch: string) => void;
}

interface CommitProps {
  readonly error: string | undefined;
  readonly dirty: boolean;
  readonly working: boolean;
  readonly message: string;
  readonly picking: boolean;
  readonly picked: readonly string[] | undefined;
  readonly changed: ChangedFiles;
  readonly onMessage: (value: string) => void;
  readonly onRefreshFiles: () => void;
  readonly onTogglePicking: () => void;
  readonly onPick: (paths: readonly string[]) => void;
  readonly onCommit: () => void;
}

function Branches({
  info,
  working,
  newBranch,
  onSwitch,
  onMerge,
  onDelete,
  onNewBranch,
  onCreateBranch,
}: BranchesProps) {
  const branchError = branchNameError(newBranch, info.branches);
  return (
    <>
      <div className="history-branches-heading">
        <h3>Branches</h3>
        <span>Click to switch</span>
      </div>
      {info.branches.map((branch) => (
        <BranchRow
          key={branch}
          branch={branch}
          info={info}
          working={working}
          onSwitch={onSwitch}
          onMerge={onMerge}
          onDelete={onDelete}
        />
      ))}
      <div className="dropdown-row git-create-branch">
        <input
          aria-label="New branch name"
          disabled={working}
          placeholder="new-branch-name"
          value={newBranch}
          aria-invalid={Boolean(branchError)}
          onChange={(event) => onNewBranch(sanitizeBranchName(event.target.value))}
          onKeyDown={(event) => {
            const name = newBranch.trim();
            if (event.key === 'Enter' && name && !branchError && !working) {
              onCreateBranch(name);
            }
          }}
        />
        <button
          disabled={working || !newBranch.trim() || Boolean(branchError)}
          onClick={() => onCreateBranch(newBranch.trim())}
        >
          Create
        </button>
      </div>
      {branchError && <div className="git-hint">{branchError}</div>}
    </>
  );
}

function BranchRow({
  branch,
  info,
  working,
  onSwitch,
  onMerge,
  onDelete,
}: Pick<BranchesProps, 'info' | 'working' | 'onSwitch' | 'onMerge' | 'onDelete'> & {
  readonly branch: string;
}) {
  const current = branch === info.branch;
  return (
    <div className={`history-branch-row ${current ? 'active' : ''}`}>
      <button
        className="history-branch-switch"
        disabled={working || current}
        aria-label={current ? `${branch}, current branch` : `Switch to ${branch}`}
        onClick={() => onSwitch(branch)}
      >
        {current ? <CheckIcon size={12} /> : <BranchIcon size={12} />}
        <Tooltip className="history-branch-name" text={branch} />
        {current && <span className="history-branch-current">Current</span>}
        {info.parked.includes(branch) && !current && (
          <span className="branch-parked" title="Changes waiting on this branch">
            Saved changes
          </span>
        )}
      </button>
      <BranchActions
        branch={branch}
        current={info.branch}
        trunk={info.trunk}
        disabled={working}
        onMerge={onMerge}
        onDelete={onDelete}
      />
    </div>
  );
}

function CommitControls({
  dirty,
  working,
  message,
  picking,
  picked,
  changed,
  onMessage,
  onTogglePicking,
  onRefreshFiles,
  onPick,
  onCommit,
  error,
}: CommitProps) {
  const pickedCount = picked?.length ?? 0;
  const label = !dirty
    ? 'Nothing to commit'
    : !picking
      ? 'Commit all changes'
      : `Commit ${pickedCount} file${pickedCount === 1 ? '' : 's'}`;
  return (
    <>
      <div className="divider" />
      <h3>Commit</h3>
      <div className="dropdown-row" style={{ flexDirection: 'column', gap: 6 }}>
        <input
          placeholder="Commit message"
          aria-label="Commit message"
          disabled={working}
          value={message}
          onChange={(event) => onMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && dirty && !working) {
              onCommit();
            }
          }}
        />
        <div className="git-commit-action-row">
          <button
            className="primary"
            disabled={working || !dirty || (picking && pickedCount === 0)}
            onClick={onCommit}
          >
            {label}
          </button>
          {dirty && (
            <CommitFilePicker
              files={changed}
              picked={picked}
              picking={picking}
              working={working}
              error={error}
              onTogglePicking={onTogglePicking}
              onRefresh={onRefreshFiles}
              onPick={onPick}
            />
          )}
        </div>
      </div>
    </>
  );
}

function GitHubControls({
  info,
  working,
  onOpenRemote,
  onPush,
  onPublish,
}: Pick<GitChipViewProps, 'info' | 'onOpenRemote' | 'onPush' | 'onPublish'> & {
  readonly working: boolean;
}) {
  const canPush = info.hasUpstream ? info.ahead > 0 : true;
  const pushLabel = !info.hasUpstream
    ? `Push ${info.branch} to origin`
    : info.ahead > 0
      ? `Push ${info.ahead} commit${info.ahead === 1 ? '' : 's'}`
      : 'Everything pushed';
  return (
    <>
      <div className="divider" />
      <h3>GitHub</h3>
      <div className="dropdown-row" style={{ flexDirection: 'column', gap: 6 }}>
        {info.remote ? (
          <>
            <button
              className="repo-link"
              title={`Open ${repoSlug(info.remote)} on GitHub`}
              onClick={() => onOpenRemote(info.remote ?? '')}
            >
              <span className="repo-slug">{repoSlug(info.remote)}</span>
              <ExternalIcon size={11} />
            </button>
            <button className="primary" disabled={working || !canPush} onClick={onPush}>
              {pushLabel}
            </button>
            {info.dirty && (
              <div className="hint-text">
                You have uncommitted changes — commit them first to include them.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="hint-text">This project isn’t on GitHub yet.</div>
            <button className="primary" disabled={working} onClick={onPublish}>
              Publish to GitHub…
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default function GitChipView(props: GitChipViewProps) {
  const working = props.busy !== undefined;
  return (
    <div className="git-panel-controls" aria-label="Repository controls">
      {props.busy && (
        <p className="history-note" role="status">
          {props.busy}
        </p>
      )}
      {props.error && (
        <div className="git-error">
          {props.error}
          <button className="ghost" title="Dismiss" onClick={props.onDismissError}>
            <CloseIcon size={11} />
          </button>
        </div>
      )}
      <Branches
        info={props.info}
        working={working}
        newBranch={props.newBranch}
        onSwitch={props.onSwitch}
        onMerge={props.onMerge}
        onDelete={props.onDelete}
        onNewBranch={props.onNewBranch}
        onCreateBranch={props.onCreateBranch}
      />
      <CommitControls
        error={props.error}
        onRefreshFiles={props.onRefreshFiles}
        dirty={props.info.dirty}
        working={working}
        message={props.commitMessage}
        picking={props.picking}
        picked={props.picked}
        changed={props.changed}
        onMessage={props.onCommitMessage}
        onTogglePicking={props.onTogglePicking}
        onPick={props.onPick}
        onCommit={props.onCommit}
      />
      <GitHubControls
        info={props.info}
        working={working}
        onOpenRemote={props.onOpenRemote}
        onPush={props.onPush}
        onPublish={props.onPublish}
      />
    </div>
  );
}

export function openGitRemote(remote: string): void {
  const url = webUrl(remote);
  if (url) {
    void window.avb.openExternal(url);
  } else {
    throw new Error('Git remote: expected a GitHub URL');
  }
}
