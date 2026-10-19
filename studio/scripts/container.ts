import { restoreCmsDeletions } from '../src/features/cms/cmsDeleted';
import { restoreAssetState } from '../src/features/assets/assetState';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { linkImageDependencies } from './dependencies';
import { writeStudioConfig } from './workspace';
import { Room } from '../src/features/collaboration/rooms';
import { preparePath } from '../src/features/project/projectServer';
import { sourcePath, filePath } from '../src/shared/validation';

const root = '/workspace';
const backend = process.env['STUDIO_BACKEND_URL'];
const token = process.env['STUDIO_CONTAINER_TOKEN'];
if (!backend || !token) {
  throw new Error('Container backend configuration is missing');
}
const headers = { 'x-studio-token': token };
console.log('Restoring repository and shared drafts');
const archive = await fetch(backend + '/studio/internal/archive', {
  headers,
  signal: AbortSignal.timeout(60_000),
});
if (!archive.ok) {
  throw new Error('Could not load repository');
}
const bytes = await archive.arrayBuffer();
if (bytes.byteLength > 100_000_000) {
  throw new Error('Repository archive exceeds 100 MB');
}
await writeFile('/workspace/repository.tgz', new Uint8Array(bytes));
await command('tar', ['xzf', '/workspace/repository.tgz', '--strip-components=1', '-C', root]);
await mkdir(path.join(root, '.studio-state'), { recursive: true });
await writeFile(
  path.join(root, '.studio-state/github-base.json'),
  JSON.stringify({ sha: archive.headers.get('x-studio-git-sha') }),
);
const filesResponse = await fetch(backend + '/studio/internal/files', { headers });
if (!filesResponse.ok) {
  throw new Error('Could not restore draft inventory');
}
const files: unknown = await filesResponse.json();
if (!Array.isArray(files) || files.length > 1000) {
  throw new Error('Invalid draft inventory');
}
for (let offset = 0; offset < files.length; offset += 4) {
  await Promise.all(
    files.slice(offset, offset + 4).map(async (input: unknown) => {
      const file = sourcePath(input);
      await mkdir(path.dirname(path.join(root, file)), { recursive: true });
      try {
        await access(path.join(root, file));
      } catch {
        await writeFile(path.join(root, file), '');
      }
      const room = new Room(root, file);
      await room.initialize();
      room.document.destroy();
    }),
  );
}
const assetsResponse = await fetch(backend + '/studio/internal/assets', { headers });
if (!assetsResponse.ok) {
  throw new Error('Could not restore assets');
}
const assets: unknown = await assetsResponse.json();
if (!Array.isArray(assets) || assets.length > 1000) {
  throw new Error('Invalid asset inventory');
}
for (let offset = 0; offset < assets.length; offset += 4) {
  await Promise.all(
    assets.slice(offset, offset + 4).map(async (input: unknown) => {
      const file = filePath(input);
      const response = await fetch(
        backend + '/studio/internal/asset?file=' + encodeURIComponent(file),
        { headers },
      );
      if (!response.ok) {
        throw new Error('Could not restore asset');
      }
      await writeFile(await preparePath(root, file), new Uint8Array(await response.arrayBuffer()));
    }),
  );
}
await restoreCmsDeletions(root);
await restoreAssetState(root);
if (!(await linkImageDependencies(root))) {
  console.log('Installing changed site dependencies from cache');
  await command('npm', [
    'ci',
    '--prefer-offline',
    '--no-audit',
    '--no-fund',
    '--cache',
    '/opt/npm-cache',
  ]);
}
console.log('Starting Astro preview');
await writeStudioConfig(root, '/opt/studio', 4350);
await command(
  process.execPath,
  [
    path.join(root, 'node_modules/astro/bin/astro.mjs'),
    'dev',
    '--config',
    'astro.studio.config.ts',
    '--host',
    '0.0.0.0',
    '--port',
    '4350',
    '--ignore-lock',
  ],
  0,
);
async function command(executable: string, args: string[], timeoutMs = 180_000) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: 'inherit', env: process.env });
    const timer = timeoutMs ? setTimeout(() => child.kill('SIGKILL'), timeoutMs) : undefined;
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${executable} failed (${code})`));
      }
    });
  });
}
