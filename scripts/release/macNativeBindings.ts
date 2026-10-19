// Universal apps carry both prebuilds unchanged. Validate the narrow lipo
// exception so an Intel-only terminal cannot silently ship to Apple Silicon.
import assert = require('node:assert/strict');
import fs = require('node:fs');
import path = require('node:path');

export function verifyMacNativeBindings(directory: string): void {
  // Four known binaries bound this check regardless of other package contents.
  for (const architecture of ['x64', 'arm64'] as const) {
    const cpuType = architecture === 'x64' ? 0x01000007 : 0x0100000c;
    for (const name of ['pty.node', 'spawn-helper'] as const) {
      const file = path.join(directory, 'prebuilds', `darwin-${architecture}`, name);
      verifyMacNativeHeader(file, cpuType);
      if (name === 'spawn-helper') {
        assert.equal(fs.statSync(file).mode & 0o111, 0o111, 'Mac spawn-helper must be executable');
      }
    }
  }
}

function verifyMacNativeHeader(file: string, cpuType: number): void {
  assert.ok(fs.existsSync(file), `Missing Mac node-pty binary: ${file}`);
  const header = Buffer.alloc(8);
  const descriptor = fs.openSync(file, 'r');
  try {
    assert.equal(fs.readSync(descriptor, header, 0, header.length, 0), header.length);
  } finally {
    fs.closeSync(descriptor);
  }
  assert.equal(header.readUInt32LE(0), 0xfeedfacf, 'Mac node-pty must be a 64-bit Mach-O binary');
  assert.equal(header.readUInt32LE(4), cpuType, 'Mac node-pty must match its prebuild directory');
}
