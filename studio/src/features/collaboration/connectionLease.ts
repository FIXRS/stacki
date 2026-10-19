import type { IncomingMessage } from 'node:http';
import { WebSocket, type RawData } from 'ws';

export function reauthorizeConnection(
  request: IncomingMessage,
  audience: 'studio' | 'preview' = 'studio',
) {
  const backend = process.env['STUDIO_BACKEND_URL'];
  const token = process.env['STUDIO_CONTAINER_TOKEN'];
  const session = request.headers['x-studio-session'];
  if (!backend || !token || typeof session !== 'string') {
    return undefined;
  }
  return async () => {
    const response = await fetch(backend + '/studio/internal/authorize', {
      method: 'POST',
      headers: { 'x-studio-token': token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ session, audience }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 401 || response.status === 403) {
      return false;
    }
    if (!response.ok) {
      throw new Error('Authorization check unavailable');
    }
    return true;
  };
}

export function maintainConnection(
  socket: WebSocket,
  authorize?: () => Promise<boolean>,
  options: { readonly checkEvery?: number; readonly pingEvery?: number } = {},
) {
  let alive = true;
  let supportsHeartbeat = false;
  let lease: ReturnType<typeof setTimeout> | undefined;
  const check = async () => {
    try {
      if (!(await authorize?.())) {
        socket.close(4001, 'Session expired or access removed');
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        lease = setTimeout(() => void check(), options.checkEvery ?? 270_000);
      }
    } catch {
      socket.close(1013, 'Authorization check unavailable');
    }
  };
  if (authorize) {
    lease = setTimeout(() => void check(), options.checkEvery ?? 270_000);
  }
  const received = (data: RawData) => {
    alive = true;
    if (String(data) === '{"type":"pong"}') {
      supportsHeartbeat = true;
    }
  };
  // Protocol ping/pong terminates at Cloudflare's proxy. Application frames
  // exercise every hop through to the editor and renew proxy activity.
  socket.on('message', received);
  const heartbeat = setInterval(() => {
    if (!alive && supportsHeartbeat) {
      socket.terminate();
      return;
    }
    alive = false;
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'ping' }));
    }
  }, options.pingEvery ?? 30_000);
  socket.once('close', () => {
    clearTimeout(lease);
    clearInterval(heartbeat);
    socket.off('message', received);
  });
}
