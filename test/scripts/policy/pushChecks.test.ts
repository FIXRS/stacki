// Goal: a push cannot pass on compilation alone or run stale tests.
// Method: execute the real push wrapper against temporary compiler and gate
// programs, checking order, failure propagation, and Electron's environment.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runPushChecks } from '../../../scripts/policy/pushChecks.mts';

function pushFixture(options: {
  readonly compilerStatus: number;
  readonly gateStatus: number;
}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'stacki-push-checks-'));
  const compiler = path.join(root, 'node_modules/typescript/bin');
  const gate = path.join(root, 'dist/scripts/gate');
  mkdirSync(compiler, { recursive: true });
  mkdirSync(gate, { recursive: true });
  writeFileSync(
    path.join(compiler, 'tsc'),
    `require('node:fs').appendFileSync('trace', 'compile\\n');
process.exit(${options.compilerStatus});`,
  );
  writeFileSync(
    path.join(gate, 'runTests.js'),
    `const assert = require('node:assert/strict');
assert.equal(process.env.ELECTRON_RUN_AS_NODE, undefined);
assert.deepEqual(process.argv.slice(2), []);
require('node:fs').appendFileSync('trace', 'full gate\\n');
process.exit(${options.gateStatus});`,
  );
  return root;
}

test('push runs the full gate after compiling and clears Electron Node mode', () => {
  const root = pushFixture({ compilerStatus: 0, gateStatus: 0 });
  const inherited = process.env['ELECTRON_RUN_AS_NODE'];
  process.env['ELECTRON_RUN_AS_NODE'] = '1';
  try {
    assert.equal(runPushChecks(root), 0);
    assert.equal(readFileSync(path.join(root, 'trace'), 'utf8'), 'compile\nfull gate\n');
    assert.equal(process.env['ELECTRON_RUN_AS_NODE'], '1');
  } finally {
    if (inherited === undefined) {
      delete process.env['ELECTRON_RUN_AS_NODE'];
    } else {
      process.env['ELECTRON_RUN_AS_NODE'] = inherited;
    }
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed compile blocks the gate instead of running stale output', () => {
  const root = pushFixture({ compilerStatus: 2, gateStatus: 0 });
  try {
    assert.equal(runPushChecks(root), 1);
    assert.equal(readFileSync(path.join(root, 'trace'), 'utf8'), 'compile\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed regression suite blocks the push', () => {
  const root = pushFixture({ compilerStatus: 0, gateStatus: 1 });
  try {
    assert.equal(runPushChecks(root), 1);
    assert.equal(readFileSync(path.join(root, 'trace'), 'utf8'), 'compile\nfull gate\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
