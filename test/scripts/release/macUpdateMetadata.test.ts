// Goal: older macOS installations must not download an incompatible Electron.
// Method: round-trip update metadata and reject malformed or oversized manifests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDocument } from 'yaml';
import { macUpdateMetadata } from '#dist/scripts/release/macUpdateMetadata.js';

test('Mac update requirements preserve artifact hashes and release metadata', () => {
  const source = 'version: 0.1.52\nfiles:\n  - url: Stacki.zip\n    sha512: checksum\n';
  const output = macUpdateMetadata(source);
  const expected = parseDocument(source);
  expected.set('minimumSystemVersion', '22.0.0');
  assert.equal(output, expected.toString());
  assert.equal(macUpdateMetadata(output), output);
});

test('invalid update metadata cannot be uploaded as a compatible release', () => {
  for (const source of [
    'invalid: [',
    'files: []',
    'version: 0.1.52',
    'version: 0.1.52\nfiles: []',
    'version: 0.1.52\nfiles: [' + Array(21).fill('file').join(',') + ']',
    'x'.repeat(1_048_577),
  ]) {
    assert.throws(() => macUpdateMetadata(source));
  }
});
