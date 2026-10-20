// Goal: draw Git ancestry faithfully without moving lanes as older pages arrive.
// Methodology: exercise forks, merges, disconnected roots, page boundaries and
// invalid topology through the pure layout, including its explicit capacity bounds.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildHistoryGraph, HISTORY_COMMITS_MAX } = require('../../helpers/rendererModule')(
  'src/features/history/historyGraph.ts',
);

const commit = (hash, parents = []) => ({ hash, parents });
const outgoing = (row) => row.edges.filter((edge) => edge.kind === 'outgoing');

test('linear history connects each child to its parent and stops at the root', () => {
  const graph = buildHistoryGraph([commit('c', ['b']), commit('b', ['a']), commit('a')]);
  assert.equal(graph.width, 1);
  assert.deepEqual(
    graph.rows.map((row) => row.lane),
    [0, 0, 0],
  );
  assert.equal(outgoing(graph.rows[0]).length, 1);
  assert.equal(graph.rows[1].edges[0].kind, 'incoming');
  assert.deepEqual(graph.rows[2].continuing, []);
  assert.equal(outgoing(graph.rows[2]).length, 0);
  assert.deepEqual(buildHistoryGraph([]), { rows: [], width: 1 });
});

test('a merge splits into two lanes and rejoins at the shared ancestor', () => {
  const graph = buildHistoryGraph([
    commit('merge', ['main', 'feature']),
    commit('feature', ['base']),
    commit('main', ['base']),
    commit('base'),
  ]);
  assert.equal(graph.width, 2);
  assert.deepEqual(
    graph.rows.map((row) => row.lane),
    [0, 1, 0, 1],
  );
  assert.deepEqual(
    outgoing(graph.rows[0]).map((edge) => edge.target),
    [0, 1],
  );
  assert.deepEqual(
    outgoing(graph.rows[2]).map((edge) => [edge.source, edge.target]),
    [[0, 1]],
  );
  assert.deepEqual(graph.rows[3].continuing, []);
});

test('unmerged tips stay independent until they reach their common ancestor', () => {
  const graph = buildHistoryGraph([
    commit('feature', ['base']),
    commit('main', ['base']),
    commit('base'),
    commit('orphan'),
  ]);
  assert.deepEqual(
    graph.rows.map((row) => row.lane),
    [0, 1, 0, 0],
  );
  assert.equal(graph.rows[1].edges[0].kind, 'through');
  assert.deepEqual(graph.rows[3].edges, []);
});

test('octopus merges connect all parents, and loading a page preserves earlier rows', () => {
  const commits = [
    commit('merge', ['a', 'b', 'c']),
    commit('a', ['root']),
    commit('b', ['root']),
    commit('c', ['root']),
    commit('root'),
  ];
  const partial = buildHistoryGraph(commits.slice(0, 2));
  const complete = buildHistoryGraph(commits);
  assert.equal(complete.width, 3);
  assert.equal(outgoing(complete.rows[0]).length, 3);
  assert.deepEqual(partial.rows, complete.rows.slice(0, 2));
  assert.deepEqual(complete.rows[4].continuing, []);
});

test('invalid graphs fail loudly instead of drawing misleading ancestry', () => {
  assert.throws(
    () => buildHistoryGraph([commit('a'), commit('a')]),
    /History graph: duplicate commit/,
  );
  assert.throws(() => buildHistoryGraph([commit('a', ['a'])]), /History graph: self parent/);
  assert.throws(
    () => buildHistoryGraph([commit('parent'), commit('child', ['parent'])]),
    /History graph: parents must follow their children/,
  );
  assert.throws(
    () => buildHistoryGraph([commit('a', ['b', 'b'])]),
    /History graph: duplicate parent/,
  );
  assert.throws(
    () => buildHistoryGraph(Array(HISTORY_COMMITS_MAX + 1).fill(commit('a'))),
    /History graph: commit limit exceeded/,
  );
  assert.throws(
    () =>
      buildHistoryGraph([
        commit(
          'a',
          Array.from({ length: 257 }, (_, index) => `${index}`),
        ),
      ]),
    /History graph: parent limit exceeded/,
  );
  const divergent = Array.from({ length: 257 }, (_, index) =>
    commit(`child-${index}`, [`parent-${index}`]),
  );
  assert.throws(() => buildHistoryGraph(divergent), /History graph: lane limit exceeded/);
});
