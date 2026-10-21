// Goal: displayed page names follow titles while Home and route identities remain stable.
// Methodology: exercise the panel label helper and live-scan updates, including clearing
// a title, nested index pages, unchanged labels and a page removed during an edit.
const test = require('node:test');
const assert = require('node:assert/strict');
const load = require('../../helpers/rendererModule');
const { pageDisplayName, buildPageTree } = load('src/features/pages/pageTree.ts');
const { updatePageTitle } = load('src/features/pages/usePageTitles.ts');

const page = (name, title) => ({ path: `/site/src/pages/${name}`, name, route: '/', title });

test('Home overrides the layout title only for a root index page', () => {
  for (const name of ['index.astro', 'index.md', 'index.mdx']) {
    assert.equal(pageDisplayName(page(name, 'Site title')), 'Home');
    assert.equal(pageDisplayName(page(name)), 'Home');
    assert.equal(pageDisplayName(page(`blog/${name}`, 'Blog')), 'Blog');
    assert.equal(pageDisplayName(page(`blog/${name}`)), 'index');
  }
});

test('layout titles are labels, never folder or filename identities', () => {
  const about = page('about/story.astro', 'Our Story');
  assert.equal(pageDisplayName(about), 'Our Story');
  const tree = buildPageTree([about], []);
  assert.equal(tree.directories.get('about').pages[0].base, 'story.astro');
  assert.equal(pageDisplayName(page('contact.astro', '  ')), 'contact');
});

test('live title changes and removal update only the matching scan page', () => {
  const about = page('about.astro', 'About');
  const other = page('other.astro', 'Other');
  const scan = { pages: [about, other], pageFolders: [], layouts: [], components: [] };
  const edited = updatePageTitle(scan, about.path, 'About us');
  assert.equal(pageDisplayName(edited.pages[0]), 'About us');
  assert.equal(edited.pages[0].name, about.name);
  assert.equal(edited.pages[1], other);
  assert.equal(updatePageTitle(edited, about.path, 'About us'), edited);
  assert.equal(updatePageTitle(edited, '/deleted.astro', 'Deleted'), edited);
  assert.equal(pageDisplayName(updatePageTitle(edited, about.path, undefined).pages[0]), 'about');
});
