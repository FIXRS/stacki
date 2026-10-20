import { mkdtemp, rm, symlink, realpath, mkdir, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { git } from '../lib/nodeTools';
import { PUBLISH_LIMITS } from '../../shared/properties/publishConfig';

export interface PublishSnapshot {
  readonly root: string;
  readonly tree: string;
  readonly index: string;
  readonly temporary: string;
}

export async function createPublishSnapshot(root: string): Promise<PublishSnapshot> {
  const temporary = await mkdtemp(path.join(tmpdir(), 'stacki-publish-'));
  const snapshot = path.join(temporary, 'site');
  const index = path.join(temporary, 'index');
  try {
    await mkdir(snapshot);
    await initializePublishIndex(root, index);
    const tree = await publishTree(root, index);
    await checkSnapshotSize(root, index);
    await git(root, ['checkout-index', '--all', `--prefix=${snapshot}${path.sep}`], {
      env: { ...process.env, GIT_INDEX_FILE: index },
    });
    await symlink(
      await realpath(path.join(root, 'node_modules')),
      path.join(snapshot, 'node_modules'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    return { root: snapshot, tree, index, temporary };
  } catch (error: unknown) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function checkSnapshotSize(root: string, index: string): Promise<void> {
  const output = await git(root, ['ls-files', '--cached', '-z'], {
    env: { ...process.env, GIT_INDEX_FILE: index },
  });
  const files = output.stdout.split('\0').filter(Boolean);
  if (files.length > PUBLISH_LIMITS.filesMax) {
    throw new Error('Publish exceeds the 10,000-file snapshot limit.');
  }
  let bytes = 0;
  for (const file of files) {
    bytes += (await lstat(path.join(root, file))).size;
    if (bytes > PUBLISH_LIMITS.snapshotBytesMax) {
      throw new Error('Publish exceeds the 256 MiB snapshot limit.');
    }
  }
}

async function initializePublishIndex(root: string, index: string): Promise<void> {
  let head: string | undefined;
  try {
    head = (await git(root, ['rev-parse', '--verify', '--quiet', 'HEAD'])).stdout.trim();
  } catch {
    // An initialized repository can legitimately have no first commit yet.
    head = undefined;
  }
  await git(root, ['read-tree', head ?? '--empty'], {
    env: { ...process.env, GIT_INDEX_FILE: index },
  });
}

export async function publishTree(root: string, index: string): Promise<string> {
  const options = { env: { ...process.env, GIT_INDEX_FILE: index } };
  // A private index captures tracked and unignored files without disturbing staged changes.
  await git(root, ['add', '--all', '--', '.'], options);
  const tree = (await git(root, ['write-tree'], options)).stdout.trim();
  if (!/^[a-f0-9]{40,64}$/.test(tree)) {
    throw new Error('Git returned an invalid publish tree.');
  }
  return tree;
}
