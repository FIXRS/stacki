// Goal: page labels reflect layout titles without executing site code or changing routes.
// Methodology: scan real Astro source variants, including aliases, invalid markup,
// nested content titles, blank titles and dynamic expressions; assert source identity survives.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scanPageTitles } from '#dist/electron/properties/pageTitles.js';

const page = { path: '/site/src/pages/example.astro', name: 'example.astro', route: '/example' };
const wrap = (props: string) =>
  `---\nimport Shell from '../layouts/Base.astro';\n---\n<Shell ${props}><h1>Hello</h1></Shell>`;

for (const [source, title] of [
  [wrap('title="Example Components"'), 'Example Components'],
  [wrap("title='About &amp; Contact'"), 'About & Contact'],
  [wrap('title="  Our Story  "'), 'Our Story'],
  [wrap('title=""'), undefined],
  [wrap('title="   "'), undefined],
  [wrap('title={getTitle()}'), undefined],
  [wrap(''), undefined],
  ['<div title="Not a layout">Content</div>', undefined],
  [wrap('').replace('<h1>Hello</h1>', '<Card title="Not the page" />'), undefined],
  ['<Shell', undefined],
] as const) {
  test(`scan title: ${source}`, () => {
    const scanned = scanPageTitles([page], [{ file: page.path, text: source }])[0];
    assert.equal(scanned?.title, title);
    assert.equal(scanned?.name, page.name);
    assert.equal(scanned?.path, page.path);
    assert.equal(scanned?.route, page.route);
  });
}

test('missing source and non-Astro pages retain their file identity', () => {
  assert.deepEqual(scanPageTitles([page], []), [page]);
  const markdown = { ...page, path: '/site/src/pages/post.md', name: 'post.md' };
  assert.deepEqual(scanPageTitles([markdown], [{ file: markdown.path, text: wrap('') }]), [
    markdown,
  ]);
});
