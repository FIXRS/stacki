// Goal: a brief Windows sharing violation must not strand a visible edit in memory.
// Method: drive the real App against scratch files and document actors, reject the
// atomic renames with EPERM, then release the lock or exercise the persistent retry UI.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { gesture, mountApp, select } = require('../../helpers/appGestures.js');
const { pageEditError } = require('#dist/electron/documents/pageRequests.js');
const { createNodeDocumentActors } = require('#dist/electron/documents/documentActors.js');
const { buildEdit } = require('#dist/electron/documents/editRequests.js');
const { parsePage } = require('#dist/electron/parse/astroParser.js');

const SOURCE = '<main><p>Before</p></main>\n';

async function fixture(context, build) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacki-save-recovery-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'src/pages/index.astro');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(file, SOURCE);
  const documents = createNodeDocumentActors({ log: () => {}, schedule: setImmediate });
  const scan = {
    pages: [{ name: 'index.astro', path: file, route: '/' }],
    components: [],
    layouts: [],
    pageFolders: [],
  };
  const app = await mountApp(root, { scan }, build, {
    bridge: {
      editPage: async ({ pagePath, authoredChecksum, edit }) => {
        const report = documents.submitEdit(
          pagePath,
          { authoredChecksum, gone: 'anchor-moved' },
          (base) => buildEdit(edit, base),
        );
        if (report.tag !== 'applied') {
          return { ok: false, error: pageEditError(pagePath, report) };
        }
        const source = fs.readFileSync(pagePath, 'utf8');
        return {
          ok: true,
          ...parsePage(source, { locs: true }),
          source,
          checksum: report.checksum,
          inverse: report.inverse,
        };
      },
    },
  });
  context.after(app.unmount);
  await select(app, [0, 0]);
  return { app, file };
}

test('an edit reaches disk after a brief file lock without another edit', async (context) => {
  const { app, file } = await fixture(context, 'save-recovery-transient');
  const rename = fs.renameSync;
  let attempts = 0;
  context.mock.method(fs, 'renameSync', (from, to) => {
    if (String(from).includes('.stacki-write-')) {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error('EPERM: file temporarily held open'), { code: 'EPERM' });
      }
    }
    return rename(from, to);
  });
  await gesture(app, async () => __panels.PropsPanel.onSetContent('After'));
  assert.equal(fs.readFileSync(file, 'utf8'), SOURCE.replace('Before', 'After'));
  assert.equal(attempts, 2, 'the same edit is retried after the lock releases');
  assert.equal(__panels.StructurePanel.pageState.save.tag, 'clean');
});

test('a failed save stays visible and Retry saves the retained edit', async (context) => {
  const { app, file } = await fixture(context, 'save-recovery-permanent');
  const rename = fs.renameSync;
  let attempts = 0;
  let locked = true;
  context.mock.method(fs, 'renameSync', (from, to) => {
    if (String(from).includes('.stacki-write-')) {
      attempts += 1;
      if (locked) {
        throw Object.assign(new Error('EPERM: file temporarily held open'), { code: 'EPERM' });
      }
    }
    return rename(from, to);
  });
  await gesture(app, async () => __panels.PropsPanel.onSetContent('After'));
  await app.act(() => new Promise((resolve) => setTimeout(resolve, 1200)));
  assert.equal(attempts, 4, 'automatic retries have a fixed bound');
  assert.equal(fs.readFileSync(file, 'utf8'), SOURCE);
  assert.equal(__panels.StructurePanel.pageState.save.tag, 'failed');
  assert.match(document.body.textContent, /has not been saved/);
  // Ordinary errors disappear after five seconds. An unsaved edit must not.
  await app.act(() => new Promise((resolve) => setTimeout(resolve, 5300)));
  assert.match(document.body.textContent, /has not been saved/);
  assert.equal(attempts, 4, 'no endless background retries');
  locked = false;
  const retry = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Retry save',
  );
  assert.ok(retry);
  await app.act(async () => {
    retry.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  assert.equal(fs.readFileSync(file, 'utf8'), SOURCE.replace('Before', 'After'));
  assert.equal(__panels.StructurePanel.pageState.save.tag, 'clean');
  assert.doesNotMatch(document.body.textContent, /has not been saved/);
});
