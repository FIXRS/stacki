// Electron 44 requires Ventura. The updater compares Darwin kernel versions,
// so its manifest needs 22.0.0 while the app's Info.plist declares macOS 13.0.0.
import assert = require('node:assert/strict');
import fs = require('node:fs');
import { isSeq, parseDocument } from 'yaml';

const MANIFEST_BYTES_MAX = 1_048_576;

export function macUpdateMetadata(source: string): string {
  assert.ok(Buffer.byteLength(source) <= MANIFEST_BYTES_MAX, 'Update manifest exceeds limit');
  const document = parseDocument(source);
  assert.equal(document.errors.length, 0, 'Update manifest must be valid YAML');
  const version: unknown = document.get('version');
  assert.equal(typeof version, 'string', 'Update manifest needs a version');
  const files = document.get('files', true);
  assert.ok(isSeq(files), 'Update manifest needs artifact files');
  assert.ok(files.items.length > 0, 'Update manifest must contain an artifact');
  assert.ok(files.items.length <= 20, 'Update manifest artifact count exceeds limit');
  document.set('minimumSystemVersion', '22.0.0');
  const output = document.toString();
  assert.equal(parseDocument(output).get('minimumSystemVersion'), '22.0.0');
  return output;
}

if (require.main === module) {
  const file = 'release/latest-mac.yml';
  assert.ok(fs.statSync(file).size <= MANIFEST_BYTES_MAX, 'Update manifest exceeds limit');
  fs.writeFileSync(file, macUpdateMetadata(fs.readFileSync(file, 'utf8')));
}
