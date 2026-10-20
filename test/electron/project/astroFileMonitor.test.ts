// Goal: file notifications describe real lifecycle changes without reporting saves as creation.
// Method: mutate an isolated project, settle each burst, and check silence on baseline and close.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createAstroFileMonitor } from '#dist/electron/project/astroFileMonitor.js';
import { watchProject } from '#dist/electron/project/projectWatcher.js';
import { record } from '#dist/shared/core/boundary.js';
import {
  parseAstroFileChanges,
  type AstroFileChange,
} from '#dist/shared/properties/astroFileChanges.js';

test('Baseline, add, atomic save, directory rename, delete, and close', async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacki-astro-notices-'));
  const directory = path.join(root, 'src/components');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'Existing.astro'), '<p>Existing</p>');
  const changes: AstroFileChange[] = [];
  const monitor = createAstroFileMonitor(root, (events) => changes.push(...events));
  context.after(() => {
    monitor.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  monitor.request();
  await delay(250);
  assert.deepEqual([...changes], []);
  const file = path.join(directory, 'New.astro');
  fs.writeFileSync(file, '<p>New</p>');
  monitor.request();
  monitor.request();
  await delay(250);
  assert.deepEqual([...changes], [{ kind: 'added', file: 'src/components/New.astro' }]);
  changes.length = 0;
  fs.writeFileSync(file + '.tmp', '<p>Edited</p>');
  fs.renameSync(file + '.tmp', file);
  monitor.request();
  await delay(250);
  assert.deepEqual([...changes], []);
  fs.renameSync(directory, path.join(root, 'src/renamed'));
  monitor.request();
  await delay(250);
  assert.equal(changes.filter((change) => change.kind === 'added').length, 2);
  assert.equal(changes.filter((change) => change.kind === 'removed').length, 2);
  changes.length = 0;
  fs.rmSync(path.join(root, 'src/renamed'), { recursive: true });
  monitor.request();
  await delay(250);
  assert.equal(changes.length, 2);
  assert.ok(changes.every((change) => change.kind === 'removed'));
  changes.length = 0;
  fs.writeFileSync(path.join(root, 'src/Late.astro'), '<p>Late</p>');
  monitor.request();
  monitor.close();
  await delay(250);
  assert.deepEqual([...changes], []);
});

test('Desktop watcher reports additions and removals once', async (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacki-watch-notices-'));
  fs.mkdirSync(path.join(root, 'src'));
  const changes: AstroFileChange[] = [];
  const watcher = watchProject({
    projectPath: root,
    isSelfWrite: () => true,
    noteExternalChange: () => {},
    notePageMayHaveChanged: () => {},
    scheduleThumb: () => {},
    mediaPattern: /\.png$/,
    send: (channel, input) => {
      const value = record(input);
      if (channel === 'fs:changed' && value['astroChanges'] !== undefined) {
        changes.push(...parseAstroFileChanges(value['astroChanges']));
      }
    },
  });
  context.after(() => {
    watcher.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  const file = path.join(root, 'src/Own.astro');
  fs.writeFileSync(file, '<p>Created in Stacki</p>');
  await waitForChanges(changes, 1);
  assert.deepEqual([...changes], [{ kind: 'added', file: 'src/Own.astro' }]);
  fs.writeFileSync(file, '<p>Edited in Stacki</p>');
  await delay(300);
  assert.equal(changes.length, 1);
  fs.unlinkSync(file);
  await delay(500);
  assert.deepEqual(
    [...changes],
    [
      { kind: 'added', file: 'src/Own.astro' },
      { kind: 'removed', file: 'src/Own.astro' },
    ],
  );
});

async function waitForChanges(changes: readonly AstroFileChange[], count: number): Promise<void> {
  // FSEvents delivery can lag while the full suite saturates the machine.
  for (let attempt = 0; attempt < 30; attempt++) {
    if (changes.length >= count) {
      return;
    }
    await delay(100);
  }
  assert.fail(`Expected ${count} file notifications, received ${changes.length}`);
}
