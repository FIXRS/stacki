import { rm, realpath } from 'node:fs/promises';
import { readPublishConfig } from './publishConfig';
import { git, ensureToolPath } from '../lib/nodeTools';
import type { PublishTarget } from '../../shared/properties/publishConfig';
import type { DesktopPublishState } from '../../shared/properties/publishState';
import { deployHosting, runPublishScripts } from './publishCommands';
import { createPublishSnapshot, publishTree } from './publishSnapshot';
import { publishingGitEnvironment, publishingGitRemote } from './publishGitHub';

// One job per desktop process bounds concurrency and prevents overlapping commits and pushes.
export class DesktopPublisher {
  private project = '';
  private current: DesktopPublishState = { kind: 'idle' };

  state(root: string): DesktopPublishState {
    return this.project === root ? this.current : { kind: 'idle' };
  }

  start(root: string, target: PublishTarget): DesktopPublishState {
    if (this.current.kind === 'running') {
      if (this.project === root) {
        return this.current;
      }
      throw new Error('Another project is publishing. Wait for it to finish.');
    }
    this.project = root;
    this.current = { kind: 'running', step: 'Preparing publish…' };
    void this.publish(root, target);
    return this.current;
  }

  private async publish(root: string, target: PublishTarget): Promise<void> {
    let github = false;
    let hosting = false;
    let temporary: string | undefined;
    try {
      ensureToolPath();
      const canonical = await realpath(root);
      const config = readPublishConfig(canonical);
      if (target === 'hosting' && config.hosting.provider === 'none') {
        throw new Error('Choose a hosting provider in Publish settings.');
      }
      const remote =
        target === 'hosting' ? undefined : await publishingGitRemote(canonical, config);
      const environment = remote ? await publishingGitEnvironment(canonical, config) : undefined;
      const branch = (await git(canonical, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim();
      const snapshot = await createPublishSnapshot(canonical);
      temporary = snapshot.temporary;
      const hookEnvironment = { STACKI_PUBLISH_TARGET: target };
      this.current = { kind: 'running', step: 'Running hooks and building website…' };
      await runPublishScripts(snapshot.root, config.beforePublish, hookEnvironment);
      await runPublishScripts(snapshot.root, [config.buildScript]);
      if (remote && environment) {
        this.current = { kind: 'running', step: 'Committing and pushing to GitHub…' };
        const commit = await commitSnapshot(canonical, { ...snapshot, branch });
        await git(canonical, ['push', remote, `${commit}:refs/heads/${branch}`], {
          env: environment,
          timeout: 120_000,
        });
        github = true;
      }
      if (target !== 'github' && config.hosting.provider !== 'none') {
        this.current = { kind: 'running', step: `Deploying to ${config.hosting.provider}…` };
        await deployHosting(snapshot.root, config);
        hosting = true;
      }
      this.current = { kind: 'running', step: 'Running after-publish scripts…' };
      await runPublishScripts(snapshot.root, config.afterPublish, hookEnvironment);
      this.current = { kind: 'done', github, hosting };
    } catch (error: unknown) {
      this.current = {
        kind: 'failed',
        github,
        hosting,
        message: error instanceof Error ? error.message : 'Publishing failed.',
      };
    } finally {
      if (temporary) {
        await rm(temporary, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }
}

async function commitSnapshot(
  root: string,
  snapshot: { readonly tree: string; readonly index: string; readonly branch: string },
): Promise<string> {
  const branch = (await git(root, ['symbolic-ref', '--short', 'HEAD'])).stdout.trim();
  if (branch !== snapshot.branch || (await publishTree(root, snapshot.index)) !== snapshot.tree) {
    throw new Error('Project changed during the build. Publish again to include the latest edits.');
  }
  await git(root, ['add', '--all', '--', '.']);
  const changes = (await git(root, ['diff', '--cached', '--name-only'])).stdout.trim();
  if (changes) {
    await git(root, ['commit', '-m', 'Publish website from Stacki']);
  }
  const commit = (await git(root, ['rev-parse', 'HEAD'])).stdout.trim();
  const tree = (await git(root, ['rev-parse', `${commit}^{tree}`])).stdout.trim();
  if (tree !== snapshot.tree) {
    throw new Error('Commit hooks changed the publish snapshot. Build and publish again.');
  }
  return commit;
}
