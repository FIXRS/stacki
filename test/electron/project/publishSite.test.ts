// Goal: published links select the live custom domain without slowing or triggering deployment.
// Method: stub CLI and HTTP boundaries with provider responses; reject hostile IPC URL shapes.
import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import command from '#dist/electron/project/publishDiscoveryCommand.js';
import { publishedSiteURL, preferredSiteDomain } from '#dist/electron/project/publishSite.js';
import { parsePublishedSiteURL } from '#dist/shared/properties/publishSite.js';
import { parseIpcPayload } from '#dist/shared/ipc/ipcPayloads.js';

const worker = { provider: 'cloudflare-workers', accountId: 'account', project: 'site' } as const;

function cloudflare(context: TestContext, responses: Readonly<Record<string, unknown>>) {
  context.mock.method(command, 'discoveryCommand', async () => ({
    type: 'oauth',
    token: 'private-token',
  }));
  context.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    const suffix = url.replace('https://api.cloudflare.com/client/v4/accounts/account', '');
    assert.ok(suffix in responses, `Unexpected provider request: ${suffix}`);
    const result = responses[suffix];
    return new Response(JSON.stringify({ success: result !== undefined, result }));
  });
}

test('Worker custom domains win over workers.dev and exclude other services', async (context) => {
  cloudflare(context, {
    '/workers/domains?service=site&environment=production': [
      { service: 'other', environment: 'production', hostname: 'wrong.example.com' },
      { service: 'site', environment: 'preview', hostname: 'preview.example.com' },
      {
        service: 'site',
        environment: 'production',
        hostname: 'disabled.example.com',
        enabled: false,
      },
      { service: 'site', environment: 'production', hostname: 'www.example.com', enabled: true },
    ],
  });
  assert.equal(await publishedSiteURL('/project', worker), 'https://www.example.com');
});

for (const domains of [[], undefined]) {
  test('Workers fall back to their enabled account subdomain', async (context) => {
    cloudflare(context, {
      '/workers/domains?service=site&environment=production': domains,
      '/workers/scripts/site/subdomain': { enabled: true },
      '/workers/subdomain': { subdomain: 'account-name' },
    });
    assert.equal(
      await publishedSiteURL('/project', worker),
      'https://site.account-name.workers.dev',
    );
  });
}

test('Disabled workers.dev does not become a guessed link', async (context) => {
  cloudflare(context, {
    '/workers/domains?service=site&environment=production': [],
    '/workers/scripts/site/subdomain': { enabled: false },
  });
  assert.equal(await publishedSiteURL('/project', worker), undefined);
  assert.equal(await publishedSiteURL('/project', { provider: 'none' }), undefined);
});

test('Pages prefers custom domains over its project subdomain', async (context) => {
  cloudflare(context, {
    '/pages/projects/site': {
      domains: ['site.pages.dev', 'example.com'],
      subdomain: 'site.pages.dev',
    },
  });
  assert.equal(
    await publishedSiteURL('/project', {
      ...worker,
      provider: 'cloudflare',
      branch: 'main',
      directory: 'dist',
    }),
    'https://example.com',
  );
});

test('Vercel follows bounded pages and selects verified production domains', async (context) => {
  context.mock.method(
    command,
    'discoveryCommand',
    async (_root: string, executable: string, args: readonly string[]) => {
      assert.equal(executable, 'vercel');
      assert.deepEqual(args.slice(2), ['--method', 'GET', '--raw', '--scope', 'team']);
      if (args[1]?.includes('until=')) {
        return { domains: [{ name: 'example.com', verified: true }], pagination: {} };
      }
      return {
        domains: [
          { name: 'site.vercel.app', verified: true },
          { name: 'unverified.com', verified: false },
          { name: 'preview.example.com', verified: true, gitBranch: 'preview' },
          { name: 'alias.example.com', verified: true, redirect: 'example.com' },
        ],
        pagination: { next: 123 },
      };
    },
  );
  assert.equal(
    await publishedSiteURL('/project', {
      provider: 'vercel',
      organizationId: 'team',
      projectId: 'site',
    }),
    'https://example.com',
  );
});

test('URL contracts reject malformed and unsafe origins and bound provider input', () => {
  assert.equal(parseIpcPayload('publish:siteURL', '/project'), '/project');
  assert.throws(() => parseIpcPayload('publish:siteURL', {}));
  assert.equal(parsePublishedSiteURL('https://example.com'), 'https://example.com');
  for (const input of [
    undefined,
    42,
    '',
    'javascript:alert(1)',
    'http://example.com',
    '//example.com',
    'https://user:secret@example.com',
    'https://example.com/path',
    'https://example.com?q=1',
    'https://example.com#fragment',
    'https://localhost',
    'https://example.com:8443',
    `https://${'a'.repeat(2048)}.com`,
  ]) {
    assert.throws(() => parsePublishedSiteURL(input));
  }
  assert.equal(preferredSiteDomain([]), undefined);
  assert.equal(preferredSiteDomain(['site.pages.dev']), 'https://site.pages.dev');
  assert.equal(preferredSiteDomain(['site.vercel.app']), 'https://site.vercel.app');
  assert.throws(() => preferredSiteDomain(Array.from({ length: 501 }, () => 'example.com')));
  assert.throws(() => preferredSiteDomain(['example.com/path']));
  assert.throws(() => preferredSiteDomain(['user@example.com']));
  assert.throws(() => preferredSiteDomain([`${'a'.repeat(254)}.com`]));
});
