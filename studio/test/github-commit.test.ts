import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { GitHubRepository } from '../src/features/github/github';
import { GitHubChangedError, GitHubRequestError } from '../src/features/github/githubErrors';
import { record } from '../src/shared/validation';

const base = 'a'.repeat(40);
const next = 'b'.repeat(40);
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
function fixture(outcome: 'advanced' | 'rejected' | 'network' | 'stale') {
  let heads = 0;
  let patches = 0;
  const transport: typeof fetch = async (input, options) => {
    const endpoint = new URL(String(input)).pathname;
    if (endpoint.endsWith('/access_tokens')) {
      return Response.json({ token: 'test-token' });
    }
    if (endpoint.endsWith('/git/ref/heads/main')) {
      heads++;
      return Response.json({
        object: { sha: outcome === 'stale' || (heads > 1 && outcome === 'advanced') ? next : base },
      });
    }
    if (endpoint.endsWith('/git/commits/' + base)) {
      return Response.json({ tree: { sha: 'tree' } });
    }
    if (endpoint.endsWith('/git/trees/tree')) {
      return Response.json({ truncated: false, tree: [] });
    }
    if (endpoint.endsWith('/git/trees')) {
      return Response.json({ sha: 'newtree' });
    }
    if (endpoint.endsWith('/git/commits')) {
      assert.deepEqual(record(JSON.parse(String(options?.body)))['parents'], [base]);
      return Response.json({ sha: 'c'.repeat(40) });
    }
    assert.ok(endpoint.endsWith('/git/refs/heads/main'));
    patches++;
    assert.equal(record(JSON.parse(String(options?.body)))['force'], false);
    if (outcome === 'network') {
      throw new TypeError('Connection interrupted');
    }
    return Response.json({}, { status: 422 });
  };
  return {
    heads: () => heads,
    patches: () => patches,
    repository: new GitHubRepository(
      {
        appId: '1',
        installationId: '2',
        repository: 'owner/site',
        branch: 'main',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      },
      transport,
    ),
  };
}

test('GitHub commit distinguishes definite ref races from ambiguous or validation failures', async () => {
  for (const outcome of ['advanced', 'rejected', 'network', 'stale'] as const) {
    const state = fixture(outcome);
    await assert.rejects(
      state.repository.commit(
        [{ path: 'src/pages/index.astro', content: '<h1>Draft</h1>' }],
        base,
        'Publish',
      ),
      outcome === 'advanced' || outcome === 'stale'
        ? GitHubChangedError
        : outcome === 'rejected'
          ? GitHubRequestError
          : TypeError,
    );
    assert.equal(state.patches(), outcome === 'stale' ? 0 : 1);
    assert.equal(state.heads(), outcome === 'network' || outcome === 'stale' ? 1 : 2);
  }
});
