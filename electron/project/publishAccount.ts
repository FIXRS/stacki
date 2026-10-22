import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { assert } from '../../shared/core/assert';
import {
  ACCOUNT_SIGN_IN_TIMEOUT_MS,
  parseAccountRequest,
  parseCloudflareSignInURL,
  type AccountRequest,
  type AccountState,
} from '../../shared/ipc/publishAccount';
import { ensureToolPath } from '../lib/nodeTools';
import { resolvePublishExecutable } from './publishExecutable';
import { publishEnvironment, stopPublishProcess } from './publishCommands';

interface Session {
  readonly id: string;
  readonly root: string;
  readonly provider: 'github' | 'cloudflare';
  readonly process: ChildProcessWithoutNullStreams;
  state: AccountState;
  output: string;
  timer: ReturnType<typeof setTimeout> | undefined;
}
const OUTPUT_CHARS_MAX = 8192;
type Launch = (root: string, provider: 'github' | 'cloudflare') => ChildProcessWithoutNullStreams;

// One login can own the CLI credential store at a time. Raw output never leaves this service.
export class PublishingAccount {
  private session: Session | undefined;

  constructor(private readonly launch: Launch = launchAccountSignIn) {}

  request(root: string, input: AccountRequest): AccountState {
    const request = parseAccountRequest(input);
    const session = this.session;
    const provider = request.provider ?? 'github';
    if (session?.id === request.id && session.root === root && session.provider === provider) {
      if (request.action === 'cancel' && accountSignInPending(session.state)) {
        this.finish(session.id, { kind: 'cancelled' });
      }
      return session.state;
    }
    if (request.action !== 'start') {
      return { kind: 'failed', message: 'This sign-in session has ended. Please try again.' };
    }
    if (session && accountSignInPending(session.state)) {
      return {
        kind: 'failed',
        message: 'Finish or cancel the account sign-in already in progress.',
      };
    }
    return this.start(root, request.id, provider);
  }

  private start(root: string, id: string, provider: 'github' | 'cloudflare'): AccountState {
    const child = this.launch(root, provider);
    const label = provider === 'github' ? 'GitHub' : 'Cloudflare';
    const tool = provider === 'github' ? 'gh' : 'Wrangler';
    const stop = () => {
      stopAccountSignIn(child, provider);
    };
    process.once('exit', stop);
    child.once('close', () => process.removeListener('exit', stop));
    const session: Session = {
      id,
      root,
      provider,
      process: child,
      state: { kind: 'starting' },
      output: '',
      timer: undefined,
    };
    this.session = session;
    session.timer = setTimeout(() => {
      this.finish(session.id, {
        kind: 'failed',
        message: `${label} sign-in expired. Please try again.`,
      });
    }, ACCOUNT_SIGN_IN_TIMEOUT_MS);
    session.timer.unref();
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: unknown) => this.read(session.id, chunk));
    child.stderr.on('data', (chunk: unknown) => this.read(session.id, chunk));
    child.on('error', () =>
      this.finish(session.id, {
        kind: 'failed',
        message: `Could not start ${label} sign-in. Install ${tool} and try again.`,
      }),
    );
    child.on('close', (code) =>
      this.finish(
        session.id,
        code === 0
          ? { kind: 'complete' }
          : {
              kind: 'failed',
              message: `${label} sign-in did not complete. Check CLI authentication and try again.`,
            },
      ),
    );
    // Piped input keeps gh in its device-code flow without an interactive shell or prompts.
    child.stdin.on('error', () => {});
    child.stdin.end();
    return session.state;
  }

  private read(id: string, chunk: unknown): void {
    const session = this.session;
    if (session === undefined || session.id !== id) {
      return;
    }
    if (!accountSignInPending(session.state)) {
      return;
    }
    assert(typeof chunk === 'string', 'Account sign-in streams use UTF-8 text');
    assert(session.output.length <= OUTPUT_CHARS_MAX, 'Account sign-in output stays bounded');
    const label = session.provider === 'github' ? 'GitHub' : 'Cloudflare';
    if (chunk.length > OUTPUT_CHARS_MAX - session.output.length) {
      this.finish(session.id, {
        kind: 'failed',
        message: `${label} sign-in returned too much output.`,
      });
      return;
    }
    session.output += chunk;
    if (session.provider === 'cloudflare') {
      const url = /https:\/\/dash\.cloudflare\.com\/oauth2\/auth\?[^\s]+(?=\s)/.exec(
        session.output,
      )?.[0];
      if (url && url.length <= 4096 && !url.includes('#')) {
        session.state = { kind: 'browser', url: parseCloudflareSignInURL(url) };
      }
      return;
    }
    const code = /one-time code: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(session.output)?.[1];
    if (code) {
      session.state = { kind: 'waiting', code };
    }
  }

  private finish(id: string, state: AccountState): void {
    const session = this.session;
    if (session === undefined || session.id !== id) {
      return;
    }
    if (!accountSignInPending(session.state)) {
      return;
    }
    assert(!accountSignInPending(state), 'Sign-in finishes with a terminal state');
    assert(this.session === session, 'Only the current sign-in session can finish');
    session.state = state;
    session.output = '';
    clearTimeout(session.timer);
    session.timer = undefined;
    if (session.process.exitCode === null && session.process.signalCode === null) {
      stopAccountSignIn(session.process, session.provider);
    }
  }
}

function accountSignInPending(state: AccountState): boolean {
  return state.kind === 'starting' || state.kind === 'waiting' || state.kind === 'browser';
}

function launchAccountSignIn(
  root: string,
  provider: 'github' | 'cloudflare',
): ChildProcessWithoutNullStreams {
  if (provider === 'cloudflare') {
    return launchCloudflareSignIn(root);
  }
  ensureToolPath();
  const environment: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', GH_PROMPT_DISABLED: '1' };
  // An inherited automation token would prevent gh from adding a locally stored account.
  delete environment['GH_TOKEN'];
  delete environment['GITHUB_TOKEN'];
  return spawn(
    'gh',
    [
      'auth',
      'login',
      '--hostname',
      'github.com',
      '--web',
      '--git-protocol',
      'https',
      '--skip-ssh-key',
    ],
    {
      cwd: root,
      env: environment,
      stdio: 'pipe',
      shell: false,
      windowsHide: true,
    },
  );
}

function launchCloudflareSignIn(root: string): ChildProcessWithoutNullStreams {
  ensureToolPath();
  const command = resolvePublishExecutable(root, {
    executable: 'wrangler',
    arguments: ['login', '--browser=false'],
    environment: {},
  });
  return spawn(command.executable, [...command.arguments], {
    cwd: root,
    env: { ...publishEnvironment(), NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' },
    detached: process.platform !== 'win32',
    stdio: 'pipe',
    shell: false,
    windowsHide: true,
  });
}

function stopAccountSignIn(
  child: ChildProcessWithoutNullStreams,
  provider: 'github' | 'cloudflare',
): void {
  if (provider === 'cloudflare') {
    // Wrangler's executable starts a child; closing only the launcher leaves OAuth listening.
    stopPublishProcess(child.pid);
  }
  child.kill('SIGKILL');
}
