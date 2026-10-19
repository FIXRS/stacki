import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { browserBoundary } from '../scripts/browserBoundary';
import type { Room } from '../src/features/collaboration/rooms';
import { createRooms } from '../src/features/collaboration/rooms';
import { Publisher, runBuild } from '../src/features/publishing/publish';
import { publishRoute } from '../src/features/publishing/publishRoutes';
import { RepositorySync } from '../src/features/github/sync';
import { automaticSync } from '../src/features/github/automaticSync';
import type { IncomingChanges, RepositoryAccess } from '../src/features/github/github';

export async function sharedPublishingFixture() {
  const root = await prepareProject();
  const rooms = createRooms(root);
  const opened = await Promise.all(
    ['index', 'other'].map((name) => rooms.get(`src/pages/${name}.astro`)),
  );
  let incoming: IncomingChanges = { sha: 'a'.repeat(40), files: [] };
  let checks = 0;
  const repository: RepositoryAccess = {
    async incoming(base) {
      checks++;
      return base === incoming.sha ? { sha: base, files: [] } : incoming;
    },
    async acceptBase() {},
    async commit() {
      throw new Error('A broken build must never reach GitHub');
    },
  };
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const publisher = new Publisher(root, repository, rooms.coordinator, async (snapshot) => {
    await gate;
    await runBuild(snapshot);
  });
  publisher.subscribe(rooms.publishing);
  const sync = new RepositorySync(root, repository, rooms);
  const automatic = automaticSync(
    sync,
    () => rooms.hasClients() && publisher.state.kind !== 'building',
    100,
  );
  const { server, url } = await serveFixture(publisher, rooms, opened);
  return {
    root,
    publisher,
    release,
    url,
    checks: () => checks,
    update: (changes: IncomingChanges) => {
      incoming = changes;
    },
    async close() {
      automatic.stop();
      release();
      for (const room of opened) {
        for (const socket of room.clients.keys()) {
          socket.terminate();
        }
        await room.durable.flush();
        room.document.destroy();
      }
      rooms.sockets.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    },
  };
}

async function prepareProject() {
  const root = await mkdtemp(path.join(tmpdir(), 'studio-shared-publish-'));
  for (const directory of ['src/pages', 'public', '.studio-state']) {
    await mkdir(path.join(root, directory), { recursive: true });
  }
  await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ type: 'module', scripts: { build: 'astro build' } }),
  );
  const source = '<h1>Original</h1>';
  for (const name of ['index', 'other']) {
    await writeFile(path.join(root, `src/pages/${name}.astro`), source);
  }
  await writeFile(
    path.join(root, '.studio-state/github-base.json'),
    JSON.stringify({ sha: 'a'.repeat(40) }),
  );
  return root;
}

async function serveFixture(
  publisher: Publisher,
  rooms: ReturnType<typeof createRooms>,
  opened: readonly Room[],
) {
  const bundle = await build({
    entryPoints: ['test/sharedPublishing.entry.tsx'],
    bundle: true,
    write: false,
    outdir: '/virtual',
    platform: 'browser',
    plugins: [browserBoundary],
    format: 'esm',
  });
  const server = createServer((request, response) => {
    if (request.url === '/studio/api/status') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ publishing: publisher.state }));
      return;
    }
    if (publishRoute(publisher, request, response, (request.url ?? '').split('?')[0] ?? '')) {
      return;
    }
    const asset = bundle.outputFiles.find((file) =>
      file.path.endsWith(request.url === '/app.css' ? '.css' : '.js'),
    );
    if (request.url === '/app.js' || request.url === '/app.css') {
      response.setHeader(
        'Content-Type',
        request.url.endsWith('.css') ? 'text/css' : 'application/javascript',
      );
      response.end(asset?.contents);
      return;
    }
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><link rel="stylesheet" href="/app.css"><div id="root"></div><script type="module" src="/app.js"></script>',
    );
  });
  server.on('upgrade', (request, socket, head) => {
    const file = new URL(request.url ?? '/', 'http://local').searchParams.get('file');
    const room = opened.find((room) => room.file === file);
    if (!room) {
      socket.destroy();
      return;
    }
    rooms.sockets.handleUpgrade(request, socket, head, (client) => room.attach(client));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}` };
}
