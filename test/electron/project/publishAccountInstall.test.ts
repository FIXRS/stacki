// Goal: missing project Wrangler installs once before login and remains cancellable and bounded.
// Method: run deterministic child processes through the real session manager and intercept only
// process launch when checking npm arguments. No packages are downloaded and no account is changed.
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import childProcess, {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { PublishingAccount } from '#dist/electron/project/publishAccount.js';
import { projectHasWrangler } from '#dist/electron/project/publishExecutable.js';
import { setToolPathHome } from '#dist/electron/lib/nodeTools.js';
import { ACCOUNT_INSTALL_TIMEOUT_MS } from '#dist/shared/ipc/publishAccount.js';

const id = '00000000-0000-4000-8000-000000000000';
const request = { id, provider: 'cloudflare' as const };
const root = process.cwd();
const browserURL = 'https://dash.cloudflare.com/oauth2/auth?client_id=test&state=nonce';
const login = `process.stdout.write('${browserURL}\\n'); setInterval(() => {}, 1000);`;

function fixture(context: TestContext, script: string) {
  const children: ChildProcessWithoutNullStreams[] = [];
  const phases: string[] = [];
  const account = new PublishingAccount(
    (_root, provider, phase) => {
      assert.equal(provider, 'cloudflare');
      phases.push(phase);
      const child = spawn(process.execPath, ['-e', phase === 'installing' ? script : login], {
        stdio: 'pipe',
        shell: false,
        detached: process.platform !== 'win32',
      });
      children.push(child);
      return child;
    },
    () => false,
  );
  context.after(() => account.request(root, { ...request, action: 'cancel' }));
  assert.deepEqual(account.request(root, { ...request, action: 'start' }), { kind: 'installing' });
  const installer = children[0];
  assert.ok(installer);
  return { account, children, installer, phases };
}

test('successful installation automatically begins login in the same session', async (context) => {
  const { account, children, installer, phases } = fixture(context, "console.log('installed');");
  assert.equal(account.request(root, { ...request, action: 'start' }).kind, 'installing');
  assert.equal(
    account.request(root, {
      ...request,
      id: '11111111-1111-4111-8111-111111111111',
      action: 'start',
    }).kind,
    'failed',
  );
  await once(installer, 'close');
  const child = children[1];
  assert.ok(child);
  await once(child.stdout, 'data');
  assert.deepEqual(phases, ['installing', 'starting']);
  assert.deepEqual(account.request(root, { ...request, action: 'status' }), {
    kind: 'browser',
    url: browserURL,
  });
  installer.emit('close', 1);
  installer.emit('error', new Error('late installer failure'));
  assert.equal(account.request(root, { ...request, action: 'status' }).kind, 'browser');
  account.request(root, { ...request, action: 'cancel' });
  await once(child, 'close');
});

test('failed installation never starts login or exposes npm output', async (context) => {
  const { account, installer, phases } = fixture(
    context,
    "process.stderr.write('registry-secret'); process.exitCode = 1;",
  );
  await once(installer, 'close');
  assert.deepEqual(phases, ['installing']);
  const state = account.request(root, { ...request, action: 'status' });
  assert.equal(state.kind, 'failed');
  assert.equal(JSON.stringify(state).includes('registry-secret'), false);
  const retry = { ...request, id: '11111111-1111-4111-8111-111111111111' };
  assert.equal(account.request(root, { ...retry, action: 'start' }).kind, 'installing');
  account.request(root, { ...retry, action: 'cancel' });
});

test('missing npm reports setup failure without retrying or leaking paths', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stacki-missing-npm-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const child = spawn(path.join(directory, 'missing-npm'), [], { stdio: 'pipe', shell: false });
  const account = new PublishingAccount(
    () => child,
    () => false,
  );
  const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
  assert.equal(account.request(directory, { ...request, action: 'start' }).kind, 'installing');
  await closed;
  assert.deepEqual(account.request(directory, { ...request, action: 'status' }), {
    kind: 'failed',
    message: 'Could not start Wrangler installation. Install Node.js and npm, then try again.',
  });
});

test('cancelling installation stops its child and never starts login', async (context) => {
  const { account, installer, phases } = fixture(
    context,
    "process.stdout.write('ready'); setInterval(() => {}, 1000);",
  );
  await once(installer.stdout, 'data');
  assert.equal(account.request(root, { ...request, action: 'cancel' }).kind, 'cancelled');
  await once(installer, 'close');
  assert.deepEqual(phases, ['installing']);
  assert.equal(account.request(root, { ...request, action: 'status' }).kind, 'cancelled');
});

test('installation timeout stops the process without starting login', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const { account, installer, phases } = fixture(
    context,
    "process.stdout.write('ready'); setInterval(() => {}, 1000);",
  );
  await once(installer.stdout, 'data');
  context.mock.timers.tick(ACCOUNT_INSTALL_TIMEOUT_MS);
  await once(installer, 'close');
  assert.deepEqual(phases, ['installing']);
  assert.deepEqual(account.request(root, { ...request, action: 'status' }), {
    kind: 'failed',
    message: 'Wrangler installation timed out. Check your connection and try again.',
  });
});

test('installation discards and bounds output', async (context) => {
  const { account, installer, phases } = fixture(
    context,
    "process.stdout.write('x'.repeat(1048577)); setInterval(() => {}, 1000);",
  );
  await once(installer, 'close');
  assert.deepEqual(phases, ['installing']);
  assert.deepEqual(account.request(root, { ...request, action: 'status' }), {
    kind: 'failed',
    message: 'Wrangler installation returned too much output.',
  });
});

test('Wrangler detection supports project and workspace dependencies', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stacki-account-install-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  assert.equal(projectHasWrangler(directory), false);
  const dependency = path.join(directory, 'node_modules/wrangler');
  await mkdir(dependency, { recursive: true });
  await writeFile(path.join(dependency, 'package.json'), '{"name":"wrangler"}');
  assert.equal(projectHasWrangler(directory), true);
  assert.equal(projectHasWrangler(path.join(directory, 'packages/site')), true);
});

test('default launch installs Wrangler in the requested site', async (context) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'stacki-account-command-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  setToolPathHome(homedir());
  const child = spawn(process.execPath, ['-e', 'process.exitCode = 1;'], {
    stdio: 'pipe',
    shell: false,
  });
  context.mock.method(
    childProcess,
    'spawn',
    (executable: string, argumentsList: readonly string[], options: SpawnOptionsWithoutStdio) => {
      assert.equal(typeof executable, 'string');
      assert.deepEqual(argumentsList.slice(-3), ['install', '--save-dev', 'wrangler']);
      assert.equal(options.cwd, directory);
      assert.equal(options.shell, false);
      assert.equal(options.detached, process.platform !== 'win32');
      return child;
    },
  );
  const account = new PublishingAccount();
  assert.equal(account.request(directory, { ...request, action: 'start' }).kind, 'installing');
  await once(child, 'close');
  assert.equal(account.request(directory, { ...request, action: 'status' }).kind, 'failed');
});
