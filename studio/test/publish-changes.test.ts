import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changedPublishFiles } from '../src/features/github/changedPublishFiles';
import { gitBlob } from '../src/features/storage/cleanupStore';
import type { RepositoryFile } from '../src/features/github/github';

const page: RepositoryFile = { path: 'src/pages/index.astro', content: '<h1>Original</h1>' };
const image: RepositoryFile = {
  path: 'public/photo.png',
  content: Buffer.from([0, 128, 255]).toString('base64'),
  encoding: 'base64',
};
const tree = {
  truncated: false,
  tree: [page, image].map((file) => ({
    path: file.path,
    type: 'blob',
    mode: '100644',
    sha: gitBlob(Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8')),
  })),
};
test('publishing uploads only changed source or binary files and skips identical snapshots', () => {
  assert.deepEqual(changedPublishFiles([page, image], tree), []);
  const updated = { ...page, content: '<h1>Edited</h1>' };
  assert.deepEqual(changedPublishFiles([updated, image], tree), [updated]);
  const binary = { ...image, content: Buffer.from([0, 129, 255]).toString('base64') };
  assert.deepEqual(changedPublishFiles([page, binary], tree), [binary]);
  const added = { path: 'src/pages/new.astro', content: '<h1>New</h1>' };
  const removed = { ...image, deleted: true };
  assert.deepEqual(changedPublishFiles([page, added, removed], tree), [added, removed]);
});
test('publish change detection rejects incomplete trees, duplicate paths, and linked files', () => {
  assert.throws(() => changedPublishFiles([page], { ...tree, truncated: true }), /incomplete/);
  assert.throws(() => changedPublishFiles([page, page], tree), /Duplicate/);
  assert.throws(
    () =>
      changedPublishFiles([page], {
        ...tree,
        tree: [{ ...tree.tree[0], mode: '120000' }],
      }),
    /link or submodule/,
  );
});
