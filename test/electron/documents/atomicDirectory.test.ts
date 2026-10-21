// Goal: save staging must remain stable and on the target filesystem without
// following a foreign link. Method: real scratch directories, failed filesystem
// operations, and a simulated mount boundary; every refusal preserves the page.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, type TestContext } from 'node:test';
import {
  atomicDirectoryOf,
  prepareAtomicDirectory,
} from '#dist/electron/documents/atomicDirectory.js';
import { replaceFileAtomic } from '#dist/electron/documents/atomicWrite.js';

function fixture(context: TestContext): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacki-staging-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'page.astro');
  fs.writeFileSync(file, 'before');
  return file;
}

test('save staging survives successful saves without accumulating temporary files', (context) => {
  const file = fixture(context);
  assert.ok(prepareAtomicDirectory(file).ok);
  const directory = atomicDirectoryOf(file);
  const before = fs.statSync(directory);
  assert.ok(replaceFileAtomic(file, Buffer.from('after')).ok);
  const after = fs.statSync(directory);
  assert.equal(after.ino, before.ino);
  assert.equal(after.dev, before.dev);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('a file occupying the staging path refuses the save without changing it', (context) => {
  const file = fixture(context);
  const directory = atomicDirectoryOf(file);
  fs.writeFileSync(directory, 'foreign');
  assert.equal(replaceFileAtomic(file, Buffer.from('after')).ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'before');
  assert.equal(fs.readFileSync(directory, 'utf8'), 'foreign');
});

test('a staging link cannot redirect temporary files elsewhere', (context) => {
  const file = fixture(context);
  const target = path.join(path.dirname(file), 'foreign');
  fs.mkdirSync(target);
  fs.symlinkSync(
    target,
    atomicDirectoryOf(file),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.equal(replaceFileAtomic(file, Buffer.from('after')).ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'before');
  assert.deepEqual(fs.readdirSync(target), []);
});

test('a staging mount on another device refuses the save', (context) => {
  const file = fixture(context);
  assert.ok(prepareAtomicDirectory(file).ok);
  const directory = atomicDirectoryOf(file);
  const lstat = fs.lstatSync;
  context.mock.method(fs, 'lstatSync', (target: fs.PathLike) => {
    const metadata = lstat(target);
    if (target === directory) {
      Object.defineProperty(metadata, 'dev', { value: metadata.dev + 1 });
    }
    return metadata;
  });
  assert.equal(replaceFileAtomic(file, Buffer.from('after')).ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), 'before');
});

test('a permission failure preparing staging is returned as a filesystem failure', (context) => {
  const file = fixture(context);
  context.mock.method(fs, 'mkdirSync', () => {
    throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
  });
  const result = replaceFileAtomic(file, Buffer.from('after'));
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'filesystem');
  assert.match(result.error.message, /EACCES/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'before');
});
