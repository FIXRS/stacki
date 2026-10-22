import { assert } from '../core/assert';
import { text } from '../core/boundary';

/** Publishing links are HTTPS origins, never executable URLs or credential-bearing links. */
export function parsePublishedSiteURL(input: unknown): string {
  const value = text(input);
  assert(value.length <= 2048, 'Published site URL exceeds limit');
  const url = new URL(value);
  assert(url.protocol === 'https:', 'Published site URL must use HTTPS');
  assert(url.username === '', 'Published site URL cannot contain a username');
  assert(url.password === '', 'Published site URL cannot contain a password');
  assert(url.hostname.length <= 253, 'Published site domain exceeds limit');
  assert(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      url.hostname,
    ),
    'Published site URL must have a domain',
  );
  assert(url.port === '', 'Published site URL cannot contain a port');
  assert(url.pathname === '/', 'Published site URL must be an origin');
  assert(url.search === '', 'Published site URL cannot contain a query');
  assert(url.hash === '', 'Published site URL cannot contain a fragment');
  assert(value === url.origin, 'Published site URL must be a canonical origin');
  return value;
}
