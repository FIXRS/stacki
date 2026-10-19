import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { record, string } from '../../src/shared/validation';
import { releaseVersion } from '../../src/features/updates/release';

export async function readJson(file: string, maximum: number): Promise<unknown> {
  const handle = await open(file, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum) {
      throw new Error('Expected a bounded JSON file: ' + file);
    }
    return JSON.parse(await handle.readFile('utf8')) as unknown;
  } finally {
    await handle.close();
  }
}

export async function projectDirectory(directory: string): Promise<string> {
  const project = await realpath(path.resolve(directory));
  const manifest = record(await readJson(path.join(project, 'package.json'), 1_000_000));
  const dependencies = record(manifest['dependencies'] ?? {});
  const development = record(manifest['devDependencies'] ?? {});
  if (typeof dependencies['astro'] !== 'string' && typeof development['astro'] !== 'string') {
    throw new Error('Run this from an existing Astro project, or pass its directory');
  }
  await requireProjectLock(project);
  return project;
}

// The local draft uses npm ci. Report missing prerequisites before installing Studio.
async function requireProjectLock(project: string): Promise<void> {
  for (const name of ['npm-shrinkwrap.json', 'package-lock.json']) {
    const file = path.join(project, name);
    const exists = await lstat(file).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return undefined;
      }
      throw error;
    });
    if (!exists) {
      continue;
    }
    const value = record(await readJson(file, 8_000_000));
    const version = value['lockfileVersion'];
    if (typeof version === 'number' && Number.isSafeInteger(version) && version >= 1) {
      return;
    }
    throw new Error('Invalid npm lockfile. Run npm install in your project before adding Studio');
  }
  throw new Error('Studio needs an npm lockfile. Run npm install in your project, then retry');
}

export async function installedVersion(project: string): Promise<string | undefined> {
  const target = path.join(project, 'studio');
  const stat = await lstat(target).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  });
  if (!stat) {
    return undefined;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('The studio path already exists and cannot be replaced by setup');
  }
  try {
    const manifest = record(await readJson(path.join(target, 'package.json'), 1_000_000));
    if (string(manifest['name'], 100) !== '@stacki/studio') {
      throw new Error('Not Stacki Studio');
    }
    const release = record(await readJson(path.join(target, 'src/shared/release.json'), 4096));
    return releaseVersion(release['version']);
  } catch {
    throw new Error('A studio folder already exists. Setup will not overwrite its contents');
  }
}
