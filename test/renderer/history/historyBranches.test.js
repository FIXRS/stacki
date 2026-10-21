// Goal: the Git panel owns branch, commit and remote controls without a title-bar chip.
// Methodology: mount the real controls and graph against a parsed, stubbed IPC transport;
// Exercise filtering, create/switch, deletion consent, conflicts and partial commit recovery.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { JSDOM } = require('jsdom');
const { repoPath, sourceSpecifier, stubSources } = require('../../helpers/sources');

test('Git controls stay open in the panel and preserve repository actions', async () => {
  const directory = repoPath('node_modules/.stacki-test/git-panel');
  fs.mkdirSync(directory, { recursive: true });
  const outfile = path.join(directory, 'panel.cjs');
  await esbuild.build({
    stdin: {
      contents: [
        `export {default as Controls} from ${sourceSpecifier('src/features/git/GitChip.tsx')};`,
        `export {default as Panel} from ` +
          `${sourceSpecifier('src/features/history/HistoryPanel.tsx')};`,
        `export {ConfirmHost} from ${sourceSpecifier('src/ui/ConfirmDialog.tsx')};`,
      ].join('\n'),
      resolveDir: repoPath('src'),
      loader: 'tsx',
    },
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    external: ['react', 'react-dom', 'react/jsx-runtime'],
    logLevel: 'silent',
    plugins: [
      stubSources('publish-dialog', {
        'src/features/git/PublishModal.tsx': () => ({
          loader: 'jsx',
          contents:
            'export default function Publish(props) { return <div role="dialog">' +
            '<h2>Publish to GitHub</h2>' +
            '<button onClick={props.onClose}>Close publish</button></div>; }',
        }),
      }),
    ],
  });
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node']) {
    global[key] = key === 'window' ? dom.window : dom.window[key];
  }
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  window.matchMedia = () => ({ matches: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react');
  const { act } = React;
  const { createRoot } = require('react-dom/client');
  const { Controls, Panel, ConfirmHost } = require(outfile);
  const root = createRoot(document.getElementById('root'));
  const requests = [];
  const checkout = { ok: true, restored: false, from: 'main', parked: false };
  let checkoutReply = async () => checkout;
  let commitError;
  let saveError;
  let info = {
    isRepo: true,
    branch: 'main',
    branches: ['main', 'feature'],
    parked: [],
    head: 'a'.repeat(40),
    dirty: true,
    ahead: 0,
    trunk: 'main',
  };
  const files = ['one.astro', 'two.astro'].map((file) => ({
    path: file,
    status: 'M',
    label: file,
    kind: 'page',
    staged: false,
    untracked: false,
  }));
  window.avb = {
    gitLog: async (payload) => {
      requests.push(['log', payload]);
      return { commits: [], atEnd: true };
    },
    gitCheckout: async (payload) => {
      requests.push(['checkout', payload]);
      return checkoutReply();
    },
    gitCommit: async (payload) => {
      requests.push(['commit', payload]);
      if (commitError) {
        throw new Error(commitError);
      }
      return { ok: true, files: 1 };
    },
    gitStatus: async () => files,
    gitDeleteBranch: async (payload) => {
      requests.push(['delete', payload]);
      return { ok: true };
    },
    gitPush: async (payload) => {
      requests.push(['push', payload]);
      return { ok: true };
    },
    gitInit: async () => {
      requests.push(['init']);
      return { ok: true };
    },
    openExternal: async (url) => {
      requests.push(['external', url]);
    },
  };
  const props = {
    project: { path: '/project', name: 'Project' },
    busy: undefined,
    flushSave: async () => {
      requests.push(['save']);
      if (saveError) {
        throw new Error(saveError);
      }
    },
    refresh: async () => {
      requests.push(['refresh']);
    },
    onWorktreeChanged: async () => {
      requests.push(['reload']);
    },
    showToast: (message, tone) => {
      requests.push(['toast', message, tone]);
    },
  };
  const render = (extra = {}) =>
    act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          undefined,
          React.createElement(Panel, {
            project: props.project,
            gitInfo: info,
            controls: React.createElement(Controls, { ...props, info, ...extra }),
          }),
          React.createElement(ConfirmHost),
        ),
      ),
    );
  const click = (element) => act(async () => element.click());
  const button = (label) =>
    Array.from(document.querySelectorAll('button')).find(
      (element) => element.textContent.trim() === label,
    );
  const fill = async (selector, value) =>
    act(async () => {
      const input = document.querySelector(selector);
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
        input,
        value,
      );
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  const checkouts = () => requests.filter(([kind]) => kind === 'checkout');
  try {
    await render();
    assert.equal(document.querySelector('h2').textContent, 'Git');
    assert.equal(
      document.querySelector('.history-body').firstElementChild.className,
      'git-panel-controls',
    );
    assert.equal(document.querySelector('.git-chip') === null, true);
    assert.equal(document.querySelector('.dropdown') === null, true);
    assert.equal(document.querySelector('[aria-label="main, current branch"]').disabled, true);
    assert.ok(button('Commit all changes'));
    assert.ok(button('Publish to GitHub…'));
    await act(async () => {
      const select = document.querySelector('[aria-label="Filter commits by branch"]');
      select.value = 'current';
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    assert.equal(requests.filter(([kind]) => kind === 'log').at(-1)[1].ref, 'HEAD');
    assert.equal(checkouts().length, 0);
    await click(document.querySelector('[title="Merge feature into main"]'));
    assert.match(document.querySelector('.modal').textContent, /Merge “feature” into “main”/);
    await click(button('Cancel'));
    await click(document.querySelector('[title="Delete feature"]'));
    assert.match(document.querySelector('[role="alertdialog"]').textContent, /Delete.*feature/);
    assert.equal(document.activeElement, button('Cancel'));
    assert.equal(
      requests.some(([kind]) => kind === 'delete'),
      false,
    );
    await click(button('Cancel'));
    assert.equal(
      requests.some(([kind]) => kind === 'delete'),
      false,
    );
    await click(document.querySelector('[title="Delete feature"]'));
    await act(async () =>
      document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    assert.equal(document.querySelector('[role="alertdialog"]') === null, true);
    assert.equal(
      requests.some(([kind]) => kind === 'delete'),
      false,
    );
    await click(document.querySelector('[title="Delete feature"]'));
    await act(async () => {
      const dialog = document.querySelector('[role="alertdialog"]');
      dialog.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
      dialog.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    assert.equal(document.querySelector('[role="alertdialog"]') === null, true);
    assert.equal(
      requests.some(([kind]) => kind === 'delete'),
      false,
    );
    await click(document.querySelector('[title="Delete feature"]'));
    await click(button('Delete branch'));
    assert.deepEqual(
      requests.filter(([kind]) => kind === 'delete'),
      [['delete', { projectPath: '/project', branch: 'feature' }]],
    );
    assert.equal(checkouts().length, 0);

    await fill('[aria-label="New branch name"]', 'new-branch');
    await click(button('Create'));
    assert.equal(checkouts().at(-1)[1].create, true);
    assert.equal(checkouts().at(-1)[1].branch, 'new-branch');
    let finishSwitch;
    checkoutReply = () =>
      new Promise((resolve) => {
        finishSwitch = resolve;
      });
    const beforeSwitch = checkouts().length;
    await act(async () => {
      const target = document.querySelector('[aria-label="Switch to feature"]');
      target.click();
      target.click();
    });
    assert.equal(checkouts().length, beforeSwitch + 1);
    assert.equal(document.querySelector('[aria-label="Switch to feature"]').disabled, true);
    await act(async () => finishSwitch(checkout));
    assert.deepEqual(requests.slice(-2), [['refresh'], ['reload']]);
    info = { ...info, branch: 'feature', head: 'b'.repeat(40) };
    await render();
    assert.equal(document.querySelector('[aria-label="feature, current branch"]').disabled, true);

    checkoutReply = async () => ({
      ok: false,
      blocked: true,
      from: 'feature',
      branch: 'main',
      files: ['one.astro'],
    });
    await click(document.querySelector('[aria-label="Switch to main"]'));
    assert.ok(button('Leave them on feature'));
    await click(button('Cancel'));
    assert.equal(document.querySelector('.modal') === null, true);
    await click(document.querySelector('[aria-label="Switch to main"]'));
    checkoutReply = async () => checkout;
    await click(button('Leave them on feature'));
    assert.equal(checkouts().at(-1)[1].parkFirst, true);
    assert.equal(document.querySelector('.modal') === null, true);

    await fill('[aria-label="Commit message"]', 'Update home');
    await click(document.querySelector('[aria-label="Choose what to commit"]'));
    const fileCheckbox = document.querySelector('dialog input[type="checkbox"]');
    assert.ok(fileCheckbox);
    await click(fileCheckbox);
    assert.equal(document.querySelector('.git-panel-controls .file-browser') === null, true);
    await click(button('Done'));
    assert.equal(document.querySelector('dialog') === null, true);
    await click(document.querySelector('[aria-label="Choose what to commit"]'));
    await act(async () =>
      document
        .querySelector('dialog')
        .dispatchEvent(new window.Event('cancel', { cancelable: true })),
    );
    assert.equal(document.querySelector('dialog') === null, true);
    commitError = 'Commit failed';
    await click(button('Commit 1 file'));
    assert.equal(document.querySelector('[aria-label="Commit message"]').value, 'Update home');
    assert.match(requests.filter(([kind]) => kind === 'toast').at(-1)[1], /Commit failed/);
    commitError = undefined;
    await click(button('Commit 1 file'));
    const committed = requests.filter(([kind]) => kind === 'commit').at(-1)[1];
    assert.equal(committed.message, 'Update home');
    assert.equal(committed.paths.length, 1);
    assert.equal(document.querySelector('[aria-label="Commit message"]').value, '');
    assert.equal(document.querySelector('.git-pick') === null, true);

    const beforeFailure = checkouts().length;
    saveError = 'Save failed';
    await click(document.querySelector('[aria-label="Switch to main"]'));
    assert.equal(checkouts().length, beforeFailure);
    assert.match(requests.filter(([kind]) => kind === 'toast').at(-1)[1], /Save failed/);
    saveError = undefined;
    await click(button('Publish to GitHub…'));
    assert.ok(button('Close publish'));
    await click(button('Close publish'));
    info = {
      ...info,
      remote: 'https://github.com/example/project.git',
      hasUpstream: true,
      ahead: 2,
    };
    await render();
    await click(button('Push 2 commits'));
    assert.equal(requests.filter(([kind]) => kind === 'push').at(-1)[1].branch, 'feature');
    await render({ busy: 'Saving…' });
    assert.equal(document.querySelector('[aria-label="Switch to main"]').disabled, true);
    info = { isRepo: false };
    await render();
    assert.ok(button('Initialize Git'));
    assert.equal(document.querySelector('[aria-label="Filter commits by branch"]') === null, true);
    await click(button('Initialize Git'));
    assert.ok(requests.some(([kind]) => kind === 'init'));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const key of [
      'window',
      'document',
      'HTMLElement',
      'Element',
      'Node',
      'IS_REACT_ACT_ENVIRONMENT',
    ]) {
      delete global[key];
    }
  }
});
