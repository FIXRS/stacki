import { ErrorToast } from '../../ui/ErrorToast';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assert } from '../../../shared/core/assert';
import type { HistoryCommit, HistoryCommitFile } from './historyBridge';
import { readHistoryLog } from './historyBridge';
import { commitAuthor, relativeTime } from './historyModel';
import { BranchIcon, PreviewIcon, RefreshIcon } from '../../ui/Icons';
import HistoryCommitFiles from './HistoryCommitFiles';
import MoreMenu from '../../ui/MoreMenu';
import Tooltip from '../../ui/Tooltip';
import HistoryGraphLane, { HISTORY_ROW_HEIGHT, historyGraphWidth } from './HistoryGraphLane';
import { buildHistoryGraph, HISTORY_COMMITS_MAX } from './historyGraph';
import type { HistoryGraphRow } from './historyGraph';

type TimelineState =
  | {
      readonly kind: 'loading';
      readonly commits: readonly HistoryCommit[];
      readonly atEnd: boolean;
    }
  | { readonly kind: 'ready'; readonly commits: readonly HistoryCommit[]; readonly atEnd: boolean }
  | {
      readonly kind: 'error';
      readonly commits: readonly HistoryCommit[];
      readonly atEnd: boolean;
      readonly message: string;
    };

interface HistoryTimelineProps {
  readonly projectPath: string;
  readonly branch: string | undefined;
  readonly head: string | undefined;
  readonly userEmail: string | undefined;
  readonly previewRef: string | undefined;
  readonly onPreviewCommit: (commit: HistoryCommit) => void;
  readonly onExitPreview: () => void;
  readonly onRestoreFile: (commit: HistoryCommit, file: HistoryCommitFile) => void;
  readonly onRestoreProject: (commit: HistoryCommit) => void;
}

export default function HistoryTimeline(props: HistoryTimelineProps) {
  const [scope, setScope] = useState<'all' | 'current'>('all');
  const [revision, setRevision] = useState(0);
  const reference = scope === 'current' ? 'HEAD' : undefined;
  const timeline = useTimeline(props, reference, revision);
  const graph = useMemo(() => buildHistoryGraph(timeline.state.commits), [timeline.state.commits]);
  const [expanded, setExpanded] = useState<string | undefined>(undefined);
  useEffect(() => {
    setExpanded((hash) =>
      hash && timeline.state.commits.some((commit) => commit.hash === hash) ? hash : undefined,
    );
  }, [timeline.state.commits]);
  return (
    <>
      <div className="history-graph-toolbar">
        <label className="history-graph-filter">
          <span>Filter commits</span>
          <select
            aria-label="Filter commits by branch"
            value={scope}
            onChange={(event) => setScope(parseHistoryScope(event.target.value))}
          >
            <option value="all">All branches</option>
            <option value="current">Current branch ({props.branch ?? 'HEAD'})</option>
          </select>
        </label>
        <button
          className="history-graph-refresh"
          onClick={() => setRevision((value) => value + 1)}
          disabled={timeline.state.kind === 'loading'}
          title="Refresh commit graph"
          aria-label="Refresh commit graph"
        >
          <RefreshIcon size={14} />
        </button>
      </div>
      {timeline.state.kind === 'loading' && <p className="history-empty">Reading history…</p>}
      {timeline.state.kind === 'error' && <ErrorToast message={timeline.state.message} />}
      {timeline.state.kind === 'ready' && timeline.state.commits.length === 0 && (
        <p className="history-empty">
          Nothing saved yet. Once you save your first version it shows up here, and you can come
          back to it whenever you like.
        </p>
      )}
      {graph.rows.map((row) => (
        <CommitRow
          key={row.commit.hash}
          commit={row.commit}
          row={row}
          width={graph.width}
          expanded={expanded === row.commit.hash}
          previewing={props.previewRef === row.commit.hash}
          toggle={() => setExpanded(expanded === row.commit.hash ? undefined : row.commit.hash)}
          {...props}
        />
      ))}
      {!timeline.state.atEnd && timeline.state.kind !== 'loading' && (
        <button className="history-more" onClick={timeline.loadOlder}>
          Show older
        </button>
      )}
    </>
  );
}

function parseHistoryScope(value: string): 'all' | 'current' {
  if (value === 'all') {
    return value;
  }
  assert(value === 'current', 'History graph: unknown branch scope');
  return value;
}

function useTimeline(
  { projectPath, branch, head }: HistoryTimelineProps,
  reference: string | undefined,
  revision: number,
) {
  const [state, setState] = useState<TimelineState>({ kind: 'loading', commits: [], atEnd: false });
  const requestRef = useRef(0);
  useEffect(() => {
    const request = ++requestRef.current;
    setState({ kind: 'loading', commits: [], atEnd: false });
    void readHistoryLog(projectPath, 0, reference).then((result) => {
      if (requestRef.current !== request) {
        return;
      }
      setState(
        result.ok
          ? { kind: 'ready', commits: result.value.commits, atEnd: result.value.atEnd }
          : { kind: 'error', commits: [], atEnd: false, message: result.error },
      );
    });
    return () => {
      requestRef.current += 1;
    };
  }, [branch, head, projectPath, reference, revision]);
  const loadOlder = useCallback(() => {
    if (state.kind === 'loading' || state.commits.length >= HISTORY_COMMITS_MAX) {
      return;
    }
    void appendHistory({ projectPath, reference }, state, requestRef, setState);
  }, [projectPath, reference, state]);
  return { state, loadOlder };
}

async function appendHistory(
  location: { readonly projectPath: string; readonly reference: string | undefined },
  previous: TimelineState,
  requestRef: React.MutableRefObject<number>,
  setState: React.Dispatch<React.SetStateAction<TimelineState>>,
): Promise<void> {
  const request = ++requestRef.current;
  setState({ kind: 'loading', commits: previous.commits, atEnd: previous.atEnd });
  const result = await readHistoryLog(
    location.projectPath,
    previous.commits.length,
    location.reference,
  );
  if (requestRef.current !== request) {
    return;
  }
  if (!result.ok) {
    setState({ kind: 'error', commits: previous.commits, atEnd: false, message: result.error });
    return;
  }
  const commits = mergeCommits(previous.commits, result.value.commits);
  setState({
    kind: 'ready',
    commits,
    atEnd: result.value.atEnd || commits.length >= HISTORY_COMMITS_MAX,
  });
}

function mergeCommits(
  previous: readonly HistoryCommit[],
  incoming: readonly HistoryCommit[],
): readonly HistoryCommit[] {
  const commits = new Map(previous.map((commit) => [commit.hash, commit]));
  for (const commit of incoming) {
    if (commits.size >= HISTORY_COMMITS_MAX) {
      break;
    }
    commits.set(commit.hash, commit);
  }
  assert(commits.size <= HISTORY_COMMITS_MAX, 'History timeline: commit limit exceeded');
  return [...commits.values()];
}

interface CommitRowProps extends HistoryTimelineProps {
  readonly commit: HistoryCommit;
  readonly row: HistoryGraphRow;
  readonly width: number;
  readonly expanded: boolean;
  readonly previewing: boolean;
  readonly toggle: () => void;
}

function CommitRow(props: CommitRowProps) {
  const { commit } = props;
  return (
    <div
      className={`history-commit ${props.expanded ? 'open' : ''} ${
        props.previewing ? 'previewing' : ''
      }`}
      style={{ gridTemplateColumns: `${historyGraphWidth(props.width)}px minmax(140px, 1fr)` }}
    >
      <HistoryGraphLane row={props.row} width={props.width} current={commit.hash === props.head} />
      <button
        className="history-commit-head"
        style={{ height: HISTORY_ROW_HEIGHT }}
        onClick={props.toggle}
        aria-expanded={props.expanded}
      >
        <span className="history-commit-main">
          <span className="history-subject-line">
            <CommitRefs commit={commit} current={commit.hash === props.head} />
            <Tooltip className="history-subject" text={commit.subject} />
          </span>
          <span className="history-meta">
            {commitAuthor(commit, props.userEmail)} · {relativeTime(commit.when)} ·{' '}
            <span className="history-row-hash" title={commit.hash}>
              {commit.shortHash}
            </span>
          </span>
        </span>
      </button>
      {props.expanded && <CommitBody {...props} />}
    </div>
  );
}

function CommitRefs({
  commit,
  current,
}: {
  readonly commit: HistoryCommit;
  readonly current: boolean;
}) {
  if (commit.refs.length === 0) {
    if (!current) {
      return undefined;
    }
  }
  return (
    <span className="history-refs">
      {current && <span className="history-ref current">HEAD</span>}
      {commit.refs
        .filter((reference) => reference !== 'HEAD')
        .map((reference) => (
          <span className="history-ref" key={reference} title={reference}>
            {reference.startsWith('tag: ') ? undefined : <BranchIcon size={10} />}
            {reference.replace(/^HEAD -> /, '')}
          </span>
        ))}
    </span>
  );
}

function CommitBody(props: CommitRowProps) {
  const { commit } = props;
  return (
    <div className="history-commit-body">
      <HistoryCommitFiles
        commit={commit}
        projectPath={props.projectPath}
        onRestoreFile={props.onRestoreFile}
      />
      <div className="history-commit-actions">
        <button
          className={`history-preview-action ${props.previewing ? 'primary' : 'ghost'}`}
          onClick={() => (props.previewing ? props.onExitPreview() : props.onPreviewCommit(commit))}
        >
          <PreviewIcon size={12} />
          {props.previewing ? 'Back to now' : 'Preview'}
        </button>
        <span className="history-hash">{commit.isMerge ? 'Merge commit' : commit.shortHash}</span>
        <MoreMenu
          title="Commit actions"
          width={230}
          items={[
            {
              label: 'Restore project to this commit…',
              onSelect: () => props.onRestoreProject(commit),
            },
          ]}
        />
      </div>
    </div>
  );
}
