// Failed frame navigations must identify a bounded local preview URL before
// crossing into the renderer. Hashes only select editor mode, not a different page.
import { pathText } from '../core/boundary';

export function parsePreviewFailure(input: unknown): string {
  const address = new URL(pathText(input));
  if (address.protocol !== 'http:') {
    throw new Error('Preview failure must use local HTTP');
  }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)) {
    throw new Error('Preview failure must identify a loopback host');
  }
  if (address.username || address.password) {
    throw new Error('Preview failure must not contain credentials');
  }
  address.hash = '';
  return address.href;
}
