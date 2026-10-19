import { setTimeout as delay } from 'node:timers/promises';
import { record } from '../../shared/validation';

export function deploymentFromEnvironment() {
  const url = process.env['STUDIO_DEPLOYMENT_URL'];
  return url ? (sha: string) => waitForDeployment(url, sha) : undefined;
}

export async function waitForDeployment(
  endpoint: string,
  sha: string,
  options: {
    readonly attempts?: number;
    readonly interval?: number;
    readonly transport?: typeof fetch;
  } = {},
): Promise<'live' | 'pending'> {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error('Invalid deployment target');
  }
  const transport = options.transport ?? fetch;
  const deadline = Date.now() + 360_000;
  for (let attempt = 0; attempt < (options.attempts ?? 120) && Date.now() < deadline; attempt++) {
    try {
      const response = await transport(url, {
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.text();
        if (body.length < 1000 && record(JSON.parse(body))['sha'] === sha) {
          return 'live';
        }
      }
    } catch {
      // A build in progress or a brief outage cannot confirm a live revision.
    }
    if (attempt + 1 < (options.attempts ?? 120)) {
      await delay(options.interval ?? 3000);
    }
  }
  return 'pending';
}
