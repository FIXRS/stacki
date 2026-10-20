// Goal: shared project settings control Studio's selected actions without changing legacy publishing.
// Method: real snapshot files and npm hooks, with an in-memory repository boundary; no live deploys.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Publisher } from '../src/features/publishing/publish';
import type { RepositoryFile } from '../src/features/github/github';
import { DEFAULT_PUBLISH_CONFIG } from '../vendor/stacki/shared/properties/publishConfig';
import { parsePublishState } from '../src/features/publishing/publishClient';

test('GitHub-only publishes shared settings and hooks while skipping hosting', async (context) => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-publish-settings-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ['src', 'public', '.studio-state', '.stacki', 'node_modules']) {
    await mkdir(path.join(root, directory));
  }
  await writeFile(
    path.join(root, '.studio-state/github-base.json'),
    JSON.stringify({ sha: 'a'.repeat(40) }),
  );
  const config = {
    ...DEFAULT_PUBLISH_CONFIG,
    hosting: { provider: 'vercel', projectId: 'prj_1', organizationId: 'team_1' },
    beforePublish: ['before'],
    afterPublish: ['after'],
  };
  await writeFile(path.join(root, '.stacki/publish.json'), JSON.stringify(config));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      scripts: { before: 'node hook.cjs', after: 'node hook.cjs' },
    }),
  );
  const output = path.join(root, 'hooks.txt');
  await writeFile(
    path.join(root, 'hook.cjs'),
    `require('node:fs').appendFileSync(${JSON.stringify(output)}, ` +
      "process.env.npm_lifecycle_event + ':' + process.env.STACKI_PUBLISH_TARGET + '\\n');",
  );
  let files: readonly RepositoryFile[] = [];
  let deployments = 0;
  const publisher = new Publisher(
    root,
    {
      async commit(snapshot) {
        files = snapshot;
        return { sha: 'b'.repeat(40), url: 'https://example.test/commit' };
      },
      async incoming() {
        throw new Error('Unexpected sync');
      },
      async acceptBase() {},
    },
    undefined,
    async () => {
      assert.equal(await readFile(output, 'utf8'), 'before:github\n');
    },
    undefined,
    async () => {
      deployments++;
      return 'live';
    },
  );
  const state = await publisher.publish('github');
  assert.equal(state.kind, 'committed');
  assert.equal(deployments, 0);
  assert.ok(files.some((file) => file.path === '.stacki/publish.json'));
  assert.equal(await readFile(output, 'utf8'), 'before:github\nafter:github\n');
});

test('hosting-only does not require GitHub and rejects missing hosting before building', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-publish-hosting-'));
  try {
    let builds = 0;
    const publisher = new Publisher(root, undefined, undefined, async () => {
      builds++;
    });
    const state = await publisher.publish('hosting');
    assert.equal(state.kind, 'failed');
    if (state.kind === 'failed') {
      assert.match(state.message, /Choose a hosting provider/);
    }
    assert.equal(builds, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  assert.deepEqual(
    parsePublishState({
      kind: 'committed',
      id: 'host-job',
      sha: '',
      url: '',
      github: 'skipped',
      deployment: 'live',
    }),
    {
      kind: 'committed',
      id: 'host-job',
      sha: '',
      url: '',
      github: 'skipped',
      deployment: 'live',
    },
  );
});
