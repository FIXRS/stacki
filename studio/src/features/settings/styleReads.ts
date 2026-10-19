import { request } from '../project/projectClient';

const pending = new Map<string, Promise<unknown>>();

// Stacki scans selectors, variables, and fonts concurrently. Share only reads
// already in flight, so each later scan still sees external stylesheet edits.
export function readStyleResource(url: string): Promise<unknown> {
  const existing = pending.get(url);
  if (existing) {
    return existing;
  }
  if (pending.size >= 1000) {
    return Promise.reject(new Error('Too many stylesheet reads. Retry shortly.'));
  }
  const reading = request(url, { signal: AbortSignal.timeout(15_000) }).finally(() => {
    pending.delete(url);
  });
  pending.set(url, reading);
  return reading;
}
