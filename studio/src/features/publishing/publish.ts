import {
  parsePublishSource,
  type PublishConfig,
  type PublishTarget,
} from '../../../vendor/stacki/shared/properties/publishConfig';
import {
  deployHosting,
  runPublishScripts,
} from '../../../vendor/stacki/electron/project/publishCommands';
import { readMetadataSource } from '../settings/projectMetadata';
import { metadataFiles } from '../settings/projectMetadata';
import { GitHubChangedError } from '../github/githubErrors';
import { readAssetState } from '../assets/assetState';
import { deploymentFromEnvironment } from './deployment';
import { cp, readFile, writeFile, symlink, rm, stat, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { GitHubRepository, type RepositoryFile, type RepositoryAccess } from '../github/github';
import { RemoteRepository } from '../github/remoteRepository';
import { walk, safePath } from '../project/projectServer';
import { record, string } from '../../shared/validation';
import { SerialQueue } from '../../shared/serialQueue';

export type PublishStage = 'preparing' | 'building' | 'committing' | 'cleanup' | 'deploying';
export type PublishState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'building';
      readonly id: string;
      readonly stage?: PublishStage;
      readonly deployment?: 'pending';
    }
  | {
      readonly kind: 'committed';
      readonly id: string;
      readonly sha: string;
      readonly url: string;
      readonly cleanupWarning?: string;
      readonly github?: 'skipped';
      readonly deployment?: 'live' | 'pending';
    }
  | { readonly kind: 'failed'; readonly id: string; readonly message: string };
export class Publisher {
  private current: PublishState = { kind: 'idle' };
  private readonly listeners = new Set<(state: PublishState) => void>();
  get state() {
    return this.current;
  }
  set state(state: PublishState) {
    this.current = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
  subscribe(listener: (state: PublishState) => void) {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }
  private running = false;
  constructor(
    readonly root: string,
    readonly github: RepositoryAccess | undefined,
    readonly coordinator = new SerialQueue(),
    readonly build: (root: string) => Promise<void> = runBuild,
    readonly cleanup?: (
      files: readonly RepositoryFile[],
      sha: string,
    ) => Promise<{ readonly warning?: string }>,
    readonly deploy:
      ((sha: string) => Promise<'live' | 'pending'>) | undefined = deploymentFromEnvironment(),
    readonly refresh?: () => Promise<unknown>,
  ) {}
  start(target: PublishTarget = 'all'): PublishState {
    if (!this.github && target !== 'hosting') {
      throw new Error('Configure the GitHub App and repository before publishing.');
    }
    if (!this.running) {
      // Respond before building. The browser polls this job instead of holding
      // one request open through a build, GitHub commit, and storage cleanup.
      void this.publish(target).catch(() => console.error('Publish snapshot cleanup failed'));
    }
    return this.state;
  }
  async publish(target: PublishTarget = 'all') {
    if (!this.github && target !== 'hosting') {
      throw new Error('Configure the GitHub App and repository before publishing.');
    }
    if (this.running) {
      throw new Error('A publish is already running');
    }
    this.running = true;
    const id = randomUUID();
    const progress = {
      kind: 'building' as const,
      id,
      ...(this.deploy ? { deployment: 'pending' as const } : {}),
    };
    this.state = { ...progress, stage: 'preparing' };
    const snapshot = path.join(tmpdir(), 'astro-studio-publish-' + id);
    let savedToGitHub = false;
    try {
      const config = parsePublishSource((await readMetadataSource(this.root, 'publish')).source);
      if (target === 'hosting') {
        return await this.publishHosting(snapshot, progress, config);
      }
      const { files, result } = await this.buildAndCommit(snapshot, progress, config, target);
      savedToGitHub = true;
      this.state = { ...progress, stage: 'cleanup' };
      await writeFile(
        path.join(this.root, '.studio-state/github-base.json'),
        JSON.stringify({ sha: result.sha }),
      );
      const cleanupWarning = await this.cleanPublishedAssets(files, result.sha);
      const deployment =
        target === 'github'
          ? undefined
          : config.hosting.provider !== 'none'
            ? await this.deployConfigured(snapshot, progress, config)
            : this.deploy
              ? await this.confirmDeployment(result.sha, progress)
              : undefined;
      await afterPublish(snapshot, config, target, { hostingComplete: deployment === 'live' });
      this.state = {
        kind: 'committed',
        id,
        ...result,
        ...(cleanupWarning ? { cleanupWarning } : {}),
        ...(deployment ? { deployment } : {}),
      };
      return this.state;
    } catch (error) {
      this.state = {
        kind: 'failed',
        id,
        message:
          (savedToGitHub ? 'Saved to GitHub. Remaining publish steps failed: ' : '') +
          (error instanceof Error ? error.message : 'Publish failed'),
      };
      return this.state;
    } finally {
      this.running = false;
      await rm(snapshot, { recursive: true, force: true });
    }
  }
  private async buildAndCommit(
    snapshot: string,
    progress: Extract<PublishState, { kind: 'building' }>,
    config: PublishConfig,
    target: PublishTarget,
  ) {
    const github = this.github;
    if (!github) {
      throw new Error('GitHub is not configured');
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      this.state = { ...progress, stage: 'preparing' };
      await this.refresh?.();
      const { files, expectedHead } = await this.coordinator.run(async () => {
        const baseline = record(
          JSON.parse(
            await readFile(path.join(this.root, '.studio-state/github-base.json'), 'utf8'),
          ),
        );
        return { expectedHead: string(baseline['sha'], 64), files: await this.snapshot(snapshot) };
      });
      this.state = { ...progress, stage: 'building' };
      await runPublishScripts(snapshot, config.beforePublish, { STACKI_PUBLISH_TARGET: target });
      if (config.buildScript === 'build') {
        await this.build(snapshot);
      } else {
        await runPublishScripts(snapshot, [config.buildScript]);
      }
      this.state = { ...progress, stage: 'committing' };
      try {
        const result = await github.commit(
          files,
          expectedHead,
          'Publish website from Astro Studio',
        );
        return { files, result };
      } catch (error) {
        if (!(error instanceof GitHubChangedError) || !this.refresh || attempt === 2) {
          throw error;
        }
        await rm(snapshot, { recursive: true, force: true });
      }
    }
    throw new Error('GitHub is changing too quickly. Try publishing again.');
  }
  private async deployConfigured(
    snapshot: string,
    progress: Extract<PublishState, { kind: 'building' }>,
    config: PublishConfig,
  ): Promise<'live'> {
    this.state = { ...progress, stage: 'deploying', deployment: 'pending' };
    await deployHosting(snapshot, config);
    return 'live';
  }
  private async publishHosting(
    snapshot: string,
    progress: Extract<PublishState, { kind: 'building' }>,
    config: PublishConfig,
  ): Promise<PublishState> {
    if (config.hosting.provider === 'none') {
      throw new Error('Choose a hosting provider in Publish settings.');
    }
    await this.coordinator.run(() => this.snapshot(snapshot));
    this.state = { ...progress, stage: 'building', deployment: 'pending' };
    await runPublishScripts(snapshot, config.beforePublish, { STACKI_PUBLISH_TARGET: 'hosting' });
    if (config.buildScript === 'build') {
      await this.build(snapshot);
    } else {
      await runPublishScripts(snapshot, [config.buildScript]);
    }
    await this.deployConfigured(snapshot, progress, config);
    await afterPublish(snapshot, config, 'hosting', { hostingComplete: true });
    this.state = {
      kind: 'committed',
      id: progress.id,
      sha: '',
      url: '',
      github: 'skipped',
      deployment: 'live',
    };
    return this.state;
  }
  private async confirmDeployment(
    sha: string,
    progress: Extract<PublishState, { kind: 'building' }>,
  ) {
    this.state = { ...progress, stage: 'deploying' };
    try {
      return (await this.deploy?.(sha)) ?? 'pending';
    } catch {
      return 'pending';
    }
  }
  private async cleanPublishedAssets(files: readonly RepositoryFile[], sha: string) {
    try {
      return (await this.cleanup?.(files, sha))?.warning;
    } catch {
      return 'Published successfully. Storage cleanup could not finish; retry from Assets.';
    }
  }
  private async snapshot(destination: string): Promise<RepositoryFile[]> {
    const files = [
      ...(await walk(this.root, 'src')),
      ...(await walk(this.root, 'public')),
      ...(await metadataFiles(this.root)),
    ];
    if (files.length > 1000) {
      throw new Error('Publish exceeds the 1,000-file limit');
    }
    const sizes = await Promise.all(
      files.map(async (file) => (await stat(await safePath(this.root, file))).size),
    );
    if (
      sizes.some((size) => size > 20_000_000) ||
      sizes.reduce((total, size) => total + size, 0) > 24_000_000
    ) {
      throw new Error(
        'Publish exceeds 20 MB per asset or 24 MB total. Optimize assets before publishing.',
      );
    }
    await cp(this.root, destination, {
      recursive: true,
      filter: (file) =>
        path.relative(this.root, file) !== path.join('.stacki', 'preview') &&
        path.relative(this.root, file) !== path.join('.stacki', 'canvas') &&
        ![
          'node_modules',
          '.studio-state',
          '.astro',
          'dist',
          '.git',
          'astro.studio.config.mjs',
          'astro.studio.config.ts',
        ].includes(path.basename(file)),
    });
    // Astro closes its configuration module runner before this callback runs.
    // Keep runtime dependencies statically imported so publishing still works.
    await symlink(
      await realpath(path.join(this.root, 'node_modules')),
      path.join(destination, 'node_modules'),
      'dir',
    );
    const assets = await readAssetState(this.root);
    const contents = await Promise.all(
      files.map(async (file) => {
        const bytes = await readFile(await safePath(destination, file));
        if (bytes.length > 20_000_000) {
          throw new Error('Asset exceeds publish size limit');
        }
        return { path: file, content: bytes.toString('base64'), encoding: 'base64' as const };
      }),
    );
    return [
      ...contents,
      ...assets.deleted
        .filter((file) => !files.includes(file))
        .map((file) => ({ path: file, content: '', encoding: 'base64' as const, deleted: true })),
    ];
  }
}
export async function runBuild(root: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], {
      // Windows executes npm's command shim through its shell; arguments are fixed.
      shell: process.platform === 'win32',
      cwd: root,
      env: {
        PATH: process.env['PATH'],
        HOME: process.env['HOME'],
        SystemRoot: process.env['SystemRoot'],
        ComSpec: process.env['ComSpec'],
        TEMP: process.env['TEMP'],
        TMP: process.env['TMP'],
        USERPROFILE: process.env['USERPROFILE'],
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let log = '';
    const collect = (chunk: Buffer) => {
      log = (log + chunk.toString()).slice(-12_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timeout = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Build failed; the live site was not changed.\n${log}`));
      }
    });
  });
}
export function githubFromEnvironment() {
  const backend = process.env['STUDIO_BACKEND_URL'];
  const token = process.env['STUDIO_CONTAINER_TOKEN'];
  if (backend && token) {
    return new RemoteRepository(backend, token);
  }
  const appId = process.env['GITHUB_APP_ID'];
  const installationId = process.env['GITHUB_INSTALLATION_ID'];
  const privateKey = process.env['GITHUB_PRIVATE_KEY'];
  const repository = process.env['GITHUB_REPOSITORY'];
  if (!appId || !installationId || !privateKey || !repository) {
    return undefined;
  }
  return new GitHubRepository({
    appId,
    installationId,
    privateKey,
    repository,
    branch: process.env['GITHUB_BRANCH'] ?? 'main',
  });
}

async function afterPublish(
  snapshot: string,
  config: PublishConfig,
  target: PublishTarget,
  options: { readonly hostingComplete: boolean },
) {
  try {
    await runPublishScripts(snapshot, config.afterPublish, { STACKI_PUBLISH_TARGET: target });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'After-publish scripts failed.';
    throw new Error((options.hostingComplete ? 'Hosting deployment completed. ' : '') + message);
  }
}
