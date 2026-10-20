import { assert } from '../../../shared/core/assert';
import type { HistoryCommit } from './historyBridge';

export const HISTORY_COMMITS_MAX = 10_000;
const GRAPH_LANES_MAX = 256;

export interface HistoryGraphEdge {
  readonly source: number;
  readonly target: number;
  readonly color: number;
  readonly kind: 'incoming' | 'outgoing' | 'through';
}

export interface HistoryGraphRow {
  readonly commit: HistoryCommit;
  readonly lane: number;
  readonly edges: readonly HistoryGraphEdge[];
  readonly continuing: readonly number[];
}

export interface HistoryGraph {
  readonly rows: readonly HistoryGraphRow[];
  readonly width: number;
}

// Slots retain their position until their ancestry ends, so adding older
// commits cannot move the lanes that the user has already been reading.
export function buildHistoryGraph(commits: readonly HistoryCommit[]): HistoryGraph {
  assert(commits.length <= HISTORY_COMMITS_MAX, 'History graph: commit limit exceeded');
  const seen = new Set<string>();
  let lanes: readonly (string | undefined)[] = [];
  let width = 1;
  const rows: HistoryGraphRow[] = [];
  for (const commit of commits) {
    assert(!seen.has(commit.hash), 'History graph: duplicate commit');
    assert(commit.parents.length <= GRAPH_LANES_MAX, 'History graph: parent limit exceeded');
    assert(
      new Set(commit.parents).size === commit.parents.length,
      'History graph: duplicate parent',
    );
    for (const parent of commit.parents) {
      assert(parent !== commit.hash, 'History graph: self parent');
      assert(!seen.has(parent), 'History graph: parents must follow their children');
    }
    const row = buildHistoryGraphRow(commit, lanes);
    rows.push(row.row);
    lanes = row.lanes;
    width = Math.max(width, row.row.lane + 1, lanes.length);
    seen.add(commit.hash);
  }
  assert(rows.length === commits.length, 'History graph: every commit has a row');
  assert(width <= GRAPH_LANES_MAX, 'History graph: lane limit exceeded');
  return { rows, width };
}

function buildHistoryGraphRow(
  commit: HistoryCommit,
  before: readonly (string | undefined)[],
): { readonly row: HistoryGraphRow; readonly lanes: readonly (string | undefined)[] } {
  const existing = before.indexOf(commit.hash);
  const lane = existing < 0 ? buildHistoryGraphFreeLane(before) : existing;
  assert(lane < GRAPH_LANES_MAX, 'History graph: lane limit exceeded');
  // Mutation is local to this row; neither the prior frontier nor returned
  // rows are modified while the next row is built.
  const lanes = [...before];
  lanes[lane] = undefined;
  const edges: HistoryGraphEdge[] = [];
  before.forEach((hash, index) => {
    if (hash !== undefined) {
      edges.push({
        source: index,
        target: index,
        color: index,
        kind: index === lane ? 'incoming' : 'through',
      });
    }
  });
  commit.parents.forEach((parent, index) => {
    let target = lanes.indexOf(parent);
    if (target < 0) {
      target = index === 0 ? lane : buildHistoryGraphFreeLane(lanes);
      assert(target < GRAPH_LANES_MAX, 'History graph: lane limit exceeded');
      lanes[target] = parent;
    }
    edges.push({ source: lane, target, color: index === 0 ? lane : target, kind: 'outgoing' });
  });
  const continuing = lanes.flatMap((hash, index) => (hash === undefined ? [] : [index]));
  assert(new Set(continuing).size === continuing.length, 'History graph: unique continuing lanes');
  return { row: { commit, lane, edges, continuing }, lanes };
}

function buildHistoryGraphFreeLane(lanes: readonly (string | undefined)[]): number {
  const vacant = lanes.indexOf(undefined);
  return vacant < 0 ? lanes.length : vacant;
}
