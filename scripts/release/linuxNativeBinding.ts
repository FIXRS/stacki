// Linux builds node-pty locally. Refuse a missing or foreign binary at packaging
// time instead of shipping an app whose embedded terminal can never start.
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');

export function verifyLinuxNativeBinding(directory: string): void {
  const candidates = [
    path.join(directory, 'build', 'Release', 'pty.node'),
    path.join(directory, 'prebuilds', 'linux-x64', 'pty.node'),
  ];
  const binding = candidates.find((candidate) => fs.existsSync(candidate));
  assert.ok(binding, 'The packaged Linux app is missing its node-pty binding. Build on Linux.');
  const header = Buffer.alloc(20);
  const descriptor = fs.openSync(binding, 'r');
  try {
    assert.equal(fs.readSync(descriptor, header, 0, header.length, 0), header.length);
  } finally {
    fs.closeSync(descriptor);
  }
  assert.equal(header.subarray(0, 4).toString('hex'), '7f454c46', 'node-pty must be ELF');
  assert.equal(header[4], 2, 'node-pty must be a 64-bit Linux binary');
  assert.equal(header[5], 1, 'node-pty must be little endian');
  assert.equal(header.readUInt16LE(18), 62, 'node-pty must match the Linux x64 package');
}
