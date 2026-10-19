import type { WebSocket } from 'ws';
import type { Peer } from './presence';
import { CURSOR_INTERVAL, parseCursorState, type CursorPacket } from './cursorPresence';

export class CursorRelay {
  private readonly positions = new Map<string, CursorPacket>();
  private readonly pending = new Map<WebSocket, CursorPacket>();
  private readonly timers = new Map<WebSocket, ReturnType<typeof setTimeout>>();
  constructor(
    private readonly peers: ReadonlyMap<WebSocket, Peer>,
    private readonly broadcast: (packet: CursorPacket) => void,
  ) {}
  receive(socket: WebSocket, value: unknown) {
    const peer = this.peers.get(socket);
    if (!peer) {
      return;
    }
    const state = parseCursorState(value);
    const packet = { ...state, id: peer.id, name: peer.name, color: peer.color ?? 0 };
    if (!packet.cursor && !this.positions.has(peer.id) && !this.pending.has(socket)) {
      return;
    }
    this.pending.set(socket, packet);
    if (!packet.cursor) {
      this.flush(socket);
    } else if (!this.timers.has(socket)) {
      this.timers.set(
        socket,
        setTimeout(() => this.flush(socket), CURSOR_INTERVAL),
      );
    }
  }
  remove(socket: WebSocket) {
    clearTimeout(this.timers.get(socket));
    this.timers.delete(socket);
    this.pending.delete(socket);
    const peer = this.peers.get(socket);
    const packet = peer && this.positions.get(peer.id);
    if (packet) {
      this.positions.delete(packet.id);
      this.broadcast({ ...packet, cursor: null, text: '', typing: false });
    }
  }
  snapshot(): readonly CursorPacket[] {
    return [...this.positions.values()];
  }
  private flush(socket: WebSocket) {
    clearTimeout(this.timers.get(socket));
    this.timers.delete(socket);
    const packet = this.pending.get(socket);
    this.pending.delete(socket);
    if (!packet || !this.peers.has(socket)) {
      return;
    }
    if (packet.cursor) {
      this.positions.set(packet.id, packet);
    } else {
      this.positions.delete(packet.id);
    }
    this.broadcast(packet);
  }
}
