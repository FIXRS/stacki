import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { maintainConnection } from '../src/features/collaboration/connectionLease';

test(
  'access refresh and heartbeats keep an authorized collaboration socket open',
  { timeout: 5000 },
  async () => {
    const { server, client, socket } = await connectedPair();
    let pings = 0;
    client.on('message', (data) => {
      if (data.toString() === JSON.stringify({ type: 'ping' })) {
        pings++;
        client.send(JSON.stringify({ type: 'pong' }));
      }
    });
    let checks = 0;
    maintainConnection(
      socket,
      async () => {
        checks++;
        return true;
      },
      { checkEvery: 50, pingEvery: 500 },
    );
    try {
      // Observe actual traffic instead of assuming heavily parallel tests can
      // service a 10 ms heartbeat or finish three checks within 150 ms.
      while (checks < 3 || pings < 2) {
        assert.equal(client.readyState, WebSocket.OPEN);
        await delay(25);
      }
      assert.ok(checks >= 3);
      assert.equal(client.readyState, WebSocket.OPEN);
      const message = new Promise<string>((resolve) => {
        const received = (data: RawData) => {
          if (String(data) === 'still connected') {
            client.off('message', received);
            resolve(String(data));
          }
        };
        client.on('message', received);
      });
      socket.send('still connected');
      assert.equal(await message, 'still connected');
    } finally {
      client.terminate();
      socket.terminate();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);

test('revoked access closes the socket instead of silently extending its authorization', async () => {
  const { server, client, socket } = await connectedPair();
  maintainConnection(socket, async () => false, { checkEvery: 10, pingEvery: 100 });
  const result: unknown[] = await once(client, 'close');
  const code = result[0];
  assert.equal(code, 4001);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function connectedPair() {
  const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const connection = once(server, 'connection');
  const client = new WebSocket(`ws://127.0.0.1:${address.port}`);
  await once(client, 'open');
  const result: unknown[] = await connection;
  const socket = result[0];
  assert.ok(socket instanceof WebSocket);
  return { server, client, socket };
}

test('a client that stops responding is disconnected even when the transport remains open', async () => {
  const { server, client, socket } = await connectedPair();
  client.once('message', () => client.send(JSON.stringify({ type: 'pong' })));
  maintainConnection(socket, undefined, { pingEvery: 15 });
  await once(client, 'close');
  assert.equal(client.readyState, WebSocket.CLOSED);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('an editor opened before heartbeat support can remain connected until it refreshes', async () => {
  const { server, client, socket } = await connectedPair();
  maintainConnection(socket, undefined, { pingEvery: 10 });
  await delay(60);
  assert.equal(client.readyState, WebSocket.OPEN);
  client.close();
  await once(client, 'close');
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
