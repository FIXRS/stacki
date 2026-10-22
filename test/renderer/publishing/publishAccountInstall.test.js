// Goal: installation remains visible and polling continues into browser sign-in.
// Method: render the account dialog with controlled IPC replies and advance the real poll once.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const { ROOT, repoPath } = require('../../helpers/sources');
const React = require('react');
const { act } = React;

test('installation keeps polling and cancellation keeps its session', async (context) => {
  const output = repoPath('node_modules/.stacki-test/publish-account-install.cjs');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  buildSync({
    entryPoints: [repoPath('src/features/publishing/PublishAccount.tsx')],
    absWorkingDir: ROOT,
    outfile: output,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    logLevel: 'silent',
  });
  const { AddPublishAccount } = require(output);
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  require('../../helpers/popupDom').installPopupDOM(dom.window);
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const calls = [];
  window.avb = {
    publishingAccount: async ({ request }) => {
      calls.push(request);
      return request.action === 'start'
        ? { kind: 'installing' }
        : { kind: 'browser', url: 'https://dash.cloudflare.com/oauth2/auth?state=test' };
    },
  };
  const root = require('react-dom/client').createRoot(document.getElementById('root'));
  context.after(() => dom.window.close());
  context.mock.timers.enable({ apis: ['setTimeout'] });
  await act(async () =>
    root.render(
      React.createElement(AddPublishAccount, {
        projectPath: '/project',
        provider: 'cloudflare',
        close() {},
        connected() {},
      }),
    ),
  );
  assert.match(document.body.textContent, /Installing Wrangler in this project/);
  assert.deepEqual(
    calls.map((call) => call.action),
    ['start'],
  );
  await act(async () => context.mock.timers.tick(1000));
  assert.match(document.body.textContent, /Continue in browser/);
  assert.deepEqual(
    calls.map((call) => call.action),
    ['start', 'status'],
  );
  await act(async () => root.unmount());
  assert.equal(calls.at(-1).action, 'cancel');
  assert.equal(new Set(calls.map((call) => call.id)).size, 1);
});
