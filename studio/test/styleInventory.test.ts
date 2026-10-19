import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { styleFiles } from '../src/features/settings/styleRoutes';
import { readSource } from '../src/features/project/projectServer';

test('style inventory retains Stacki formats, ordering and component provenance', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-styles-'));
  const files = {
    'src/deep/global.css': '.a { color: red; }',
    'src/theme.SCSS': '.b { color: blue; }',
    'public/theme.less': '.c { color: green; }',
    'src/theme.sass': '.d\n  color: red',
    'src/components/Global.astro': '<STYLE is:global>.green { color: green; }</STYLE>',
    'src/components/Scoped.astro': '<style>.scoped { color: red; }</style>',
    'src/components/NotGlobal.astro': '<style is:globalish>.other { color: red; }</style>',
    'src/components/Oversized.astro': '<style is:global></style>' + ' '.repeat(512 * 1024),
  };
  try {
    for (const [file, source] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      await writeFile(path.join(root, file), source);
    }
    assert.deepEqual(
      (await styleFiles(root, false)).files.map((file) => file.rel),
      ['public/theme.less', 'src/theme.sass', 'src/theme.SCSS', 'src/deep/global.css'],
    );
    assert.deepEqual(
      (await styleFiles(root, true)).files.map((file) => file.rel),
      ['src/components/Global.astro'],
    );
    assert.equal(await readSource(root, 'src/theme.SCSS'), files['src/theme.SCSS']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
