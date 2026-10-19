import { GitHubChangedError } from '../src/features/github/githubErrors';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { Publisher } from '../src/features/publishing/publish';
import type { RepositoryAccess, RepositoryFile } from '../src/features/github/github';

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-publish-'));
  for (const directory of ['src/pages', 'public', '.studio-state', 'node_modules']) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  await writeFile(path.join(root, 'src/pages/index.astro'), '<h1>Captured</h1>');
  await writeFile(path.join(root, 'public/photo.png'), Buffer.from([0, 1, 128, 255]));
  await writeFile(
    path.join(root, '.studio-state/github-base.json'),
    JSON.stringify({ sha: 'a'.repeat(40) }),
  );
  return root;
}
function repository(
  commit: (files: readonly RepositoryFile[]) => Promise<{ sha: string; url: string }>,
): RepositoryAccess {
  return {
    commit,
    async incoming() {
      throw new Error('Unexpected sync');
    },
    async acceptBase() {},
  };
}
test('failed builds never write to GitHub or advance the published baseline', async () => {
  const root = await fixture();
  let commits = 0;
  try {
    const publisher = new Publisher(
      root,
      repository(async () => {
        commits++;
        throw new Error('Must not commit');
      }),
      undefined,
      async () => {
        throw new Error('Build failed');
      },
    );
    assert.equal((await publisher.publish()).kind, 'failed');
    assert.equal(commits, 0);
    assert.match(await readFile(path.join(root, '.studio-state/github-base.json'), 'utf8'), /aaaa/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('publishing uses the built snapshot and preserves binary assets while editing continues', async () => {
  const root = await fixture();
  try {
    let committed: readonly RepositoryFile[] = [];
    const publisher = new Publisher(
      root,
      repository(async (files) => {
        committed = files;
        return { sha: 'b'.repeat(40), url: 'https://github.com/example/site/commit/b' };
      }),
      undefined,
      async (snapshot) => {
        assert.equal(
          await readFile(path.join(snapshot, 'src/pages/index.astro'), 'utf8'),
          '<h1>Captured</h1>',
        );
        await writeFile(path.join(root, 'src/pages/index.astro'), '<h1>Next draft</h1>');
      },
    );
    assert.equal((await publisher.publish()).kind, 'committed');
    assert.equal(
      Buffer.from(
        committed.find((file) => file.path.endsWith('.astro'))?.content ?? '',
        'base64',
      ).toString(),
      '<h1>Captured</h1>',
    );
    assert.deepEqual(
      Buffer.from(committed.find((file) => file.path.endsWith('.png'))?.content ?? '', 'base64'),
      Buffer.from([0, 1, 128, 255]),
    );
    assert.equal(
      await readFile(path.join(root, 'src/pages/index.astro'), 'utf8'),
      '<h1>Next draft</h1>',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('cleanup runs only after a successful commit and its failure does not undo publishing', async () => {
  const root = await fixture();
  let cleanups = 0;
  const cleanup = async () => {
    cleanups++;
    assert.match(await readFile(path.join(root, '.studio-state/github-base.json'), 'utf8'), /bbbb/);
    throw new Error('Storage temporarily unavailable');
  };
  try {
    const failed = new Publisher(
      root,
      repository(async () => {
        throw new Error('Commit failed');
      }),
      undefined,
      async () => {},
      cleanup,
    );
    assert.equal((await failed.publish()).kind, 'failed');
    assert.equal(cleanups, 0);
    const succeeded = new Publisher(
      root,
      repository(async () => ({
        sha: 'b'.repeat(40),
        url: 'https://github.com/example/site/commit/b',
      })),
      undefined,
      async () => {},
      cleanup,
    );
    const result = await succeeded.publish();
    assert.equal(result.kind, 'committed');
    assert.equal(cleanups, 1);
    assert.ok(
      'cleanupWarning' in result && result.cleanupWarning?.includes('Published successfully'),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a confirmed GitHub race refreshes and rebuilds before retrying the commit', async () => {
  const root = await fixture();
  let attempts = 0;
  let builds = 0;
  let refreshes = 0;
  const repository: RepositoryAccess = {
    async incoming() {
      throw new Error('Handled by refresh');
    },
    async acceptBase() {},
    async commit(files, expectedHead) {
      attempts++;
      if (attempts === 1) {
        throw new GitHubChangedError();
      }
      assert.equal(expectedHead, 'b'.repeat(40));
      const source = files.find((file) => file.path.endsWith('.astro'));
      assert.equal(
        Buffer.from(source?.content ?? '', 'base64').toString(),
        '<h1>Latest merged draft</h1>',
      );
      return { sha: 'c'.repeat(40), url: 'https://example.test/commit' };
    },
  };
  const publisher = new Publisher(
    root,
    repository,
    undefined,
    async (snapshot) => {
      builds++;
      assert.equal(
        await readFile(path.join(snapshot, 'src/pages/index.astro'), 'utf8'),
        builds === 1 ? '<h1>Captured</h1>' : '<h1>Latest merged draft</h1>',
      );
    },
    undefined,
    undefined,
    async () => {
      if (++refreshes === 2) {
        await writeFile(
          path.join(root, '.studio-state/github-base.json'),
          JSON.stringify({ sha: 'b'.repeat(40) }),
        );
        await writeFile(path.join(root, 'src/pages/index.astro'), '<h1>Latest merged draft</h1>');
      }
    },
  );
  try {
    assert.equal((await publisher.publish()).kind, 'committed');
    assert.deepEqual([attempts, builds, refreshes], [2, 2, 2]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('ambiguous commit failures are never automatically retried', async () => {
  const root = await fixture();
  let attempts = 0;
  const publisher = new Publisher(
    root,
    repository(async () => {
      attempts++;
      throw new Error('Connection lost');
    }),
    undefined,
    async () => {},
    undefined,
    undefined,
    async () => {},
  );
  try {
    assert.equal((await publisher.publish()).kind, 'failed');
    assert.equal(attempts, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
