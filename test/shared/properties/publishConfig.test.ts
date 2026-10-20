// Goal: both hosts accept the same bounded publish settings and reject unsafe command inputs.
// Method: parse round trips, corrupt each boundary, and inspect provider command arguments.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PUBLISH_CONFIG,
  parsePublishConfig,
  parsePublishSource,
  parsePublishTarget,
} from '#dist/shared/properties/publishConfig.js';
import { hostingCommand, scriptCommand } from '#dist/shared/properties/publishCommands.js';
import { parseDesktopPublishState } from '#dist/shared/properties/publishState.js';
import { parseIpcPayload } from '#dist/shared/ipc/ipcPayloads.js';
import { validateMetadata } from '#dist/shared/properties/projectMetadata.js';

const cloudflare = {
  provider: 'cloudflare',
  accountId: 'account123',
  project: 'my-site',
  branch: 'main',
  directory: 'dist',
} as const;

test('project publishing settings round-trip through metadata and IPC', () => {
  const config = {
    ...DEFAULT_PUBLISH_CONFIG,
    githubAccount: 'project-owner',
    hosting: cloudflare,
    beforePublish: ['check'],
    afterPublish: ['search:index', 'cache:purge'],
  };
  const source = JSON.stringify(config);
  assert.deepEqual(parsePublishSource(source), config);
  assert.deepEqual(parsePublishSource(undefined), DEFAULT_PUBLISH_CONFIG);
  assert.doesNotThrow(() => validateMetadata('publish', source));
  for (const target of ['all', 'github', 'hosting']) {
    assert.deepEqual(parseIpcPayload('publish:start', { projectPath: '/site', target }), {
      projectPath: '/site',
      target,
    });
  }
  assert.equal(parseIpcPayload('publish:state', '/site'), '/site');
  assert.throws(() => parseIpcPayload('publish:start', { projectPath: '/site', target: 'shell' }));
  assert.throws(() => parsePublishTarget(undefined));
});

test('malformed settings fail before anything can run', () => {
  const corruptions: readonly unknown[] = [
    undefined,
    {},
    { ...DEFAULT_PUBLISH_CONFIG, version: 2 },
    { ...DEFAULT_PUBLISH_CONFIG, githubAccount: 'owner@example.com' },
    { ...DEFAULT_PUBLISH_CONFIG, githubAccount: 'a'.repeat(40) },
    { ...DEFAULT_PUBLISH_CONFIG, buildScript: '--help' },
    { ...DEFAULT_PUBLISH_CONFIG, beforePublish: ['build && upload'] },
    { ...DEFAULT_PUBLISH_CONFIG, beforePublish: Array.from({ length: 9 }, () => 'build') },
    { ...DEFAULT_PUBLISH_CONFIG, afterPublish: [13] },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { provider: 'other' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { ...cloudflare, accountId: '' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { ...cloudflare, project: '--help' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { ...cloudflare, directory: '../outside' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { ...cloudflare, directory: '/outside' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { ...cloudflare, directory: 'dist/../outside' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { ...cloudflare, directory: 'dist\\outside' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { ...cloudflare, branch: 'main;echo token' } },
    { ...DEFAULT_PUBLISH_CONFIG, hosting: { provider: 'vercel', projectId: 'prj_1' } },
  ];
  for (const value of corruptions) {
    assert.throws(() => parsePublishConfig(value), JSON.stringify(value));
  }
  assert.throws(() => parsePublishSource(' '.repeat(16_385)), /16 KiB/);
  assert.throws(() => scriptCommand(''), /must be named/);
  assert.throws(() => scriptCommand('--help'), /cannot be an option/);
});

test('provider commands pin account and project without changing global CLI state', () => {
  assert.deepEqual(hostingCommand(cloudflare), {
    executable: 'wrangler',
    arguments: [
      'pages',
      'deploy',
      'dist',
      '--project-name',
      'my-site',
      '--branch',
      'main',
      '--commit-dirty=true',
    ],
    environment: { CLOUDFLARE_ACCOUNT_ID: 'account123' },
  });
  assert.deepEqual(
    hostingCommand({
      provider: 'vercel',
      projectId: 'prj_123',
      organizationId: 'team_123',
    }),
    {
      executable: 'vercel',
      arguments: ['deploy', '--prod', '--yes'],
      environment: { VERCEL_ORG_ID: 'team_123', VERCEL_PROJECT_ID: 'prj_123' },
    },
  );
  assert.deepEqual(
    parseDesktopPublishState({
      kind: 'failed',
      github: true,
      hosting: false,
      message: 'Deployment failed',
    }),
    { kind: 'failed', github: true, hosting: false, message: 'Deployment failed' },
  );
  assert.throws(() => parseDesktopPublishState({ kind: 'done', github: 'yes', hosting: false }));
  assert.throws(() => parseDesktopPublishState({ kind: 'unknown' }));
});

test('Workers keep their Wrangler configuration and require an explicit account when saved', () => {
  const hosting = {
    provider: 'cloudflare-workers',
    accountId: 'account123',
    project: 'website',
  } as const;
  const config = { ...DEFAULT_PUBLISH_CONFIG, hosting };
  assert.deepEqual(parsePublishConfig(config), config);
  assert.deepEqual(hostingCommand(hosting), {
    executable: 'wrangler',
    arguments: ['deploy', '--name', 'website'],
    environment: { CLOUDFLARE_ACCOUNT_ID: 'account123' },
  });
  assert.throws(() => parsePublishConfig({ ...config, hosting: { ...hosting, accountId: '' } }));
  assert.throws(() =>
    parsePublishConfig({ ...config, hosting: { ...hosting, project: '--help' } }),
  );
});
