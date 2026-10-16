// Goal: reject absent, truncated, or foreign native modules before Linux ships.
// Methodology: build small ELF header fixtures in a temporary package layout
// and exercise the same verification hook that checks the real release binary.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { verifyLinuxNativeBinding } from '#dist/scripts/release/linuxNativeBinding.js';

test('Linux package requires an x64 ELF binding in a runtime-loadable location', () => {
  const directory = mkdtempSync(join(tmpdir(), 'stacki-linux-binding-'));
  const release = join(directory, 'build', 'Release');
  const binding = join(release, 'pty.node');
  const header = Buffer.alloc(20);
  header.write('7f454c46', 0, 'hex');
  header[4] = 2;
  header[5] = 1;
  header.writeUInt16LE(62, 18);
  try {
    assert.throws(() => verifyLinuxNativeBinding(directory), /missing its node-pty binding/);
    mkdirSync(release, { recursive: true });
    writeFileSync(binding, header);
    assert.doesNotThrow(() => verifyLinuxNativeBinding(directory));
    for (const [offset, value, message] of [
      [0, 0, /must be ELF/],
      [4, 1, /64-bit/],
      [5, 2, /little endian/],
      [18, 183, /Linux x64/],
    ] as const) {
      const invalid = Buffer.from(header);
      invalid[offset] = value;
      writeFileSync(binding, invalid);
      assert.throws(() => verifyLinuxNativeBinding(directory), message);
    }
    writeFileSync(binding, header.subarray(0, 8));
    assert.throws(() => verifyLinuxNativeBinding(directory));
    rmSync(join(directory, 'build'), { recursive: true });
    const prebuilt = join(directory, 'prebuilds', 'linux-x64');
    mkdirSync(prebuilt, { recursive: true });
    writeFileSync(join(prebuilt, 'pty.node'), header);
    assert.doesNotThrow(() => verifyLinuxNativeBinding(directory));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
