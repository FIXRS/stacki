// Goal: preserve builder installation behavior while enabling the Linux sandbox.
// Methodology: transform the installed builder template, check both permission
// operations, and reject incompatible or oversized future template versions.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { linuxInstallerTemplate } from '#dist/scripts/release/linuxInstaller.js';

const require = createRequire(import.meta.url);

test('Debian install configures the sandbox without a root-only namespace probe', () => {
  const template = readFileSync(
    require.resolve('app-builder-lib/templates/linux/after-install.tpl'),
    'utf8',
  );
  const result = linuxInstallerTemplate(template);
  assert.match(result, /chown root:root .*chrome-sandbox.* \|\| exit 1/);
  assert.match(result, /chmod 4755 .*chrome-sandbox.* \|\| exit 1/);
  assert.doesNotMatch(result, /unshare|chmod 0755|--no-sandbox/);
  assert.ok(result.includes('update-alternatives --install'));
  assert.ok(result.includes('update-desktop-database'));
  assert.throws(() => linuxInstallerTemplate('#!/bin/bash\n'), /template changed/);
  assert.throws(() => linuxInstallerTemplate('x'.repeat(10001)), /exceeds limit/);
});
