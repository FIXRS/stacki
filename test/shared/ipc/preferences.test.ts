// Verify preference replies before the desktop settings popup consumes them.
// Valid values round-trip; missing and malformed boolean fields are rejected.
import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePreferences, parsePreferenceResult } from '#dist/shared/ipc/preferences.js';

test('desktop preference replies require boolean values and save status', () => {
  const preferences = { sound: true, usageCountsEnabled: false };
  assert.deepEqual(parsePreferences(preferences), preferences);
  assert.deepEqual(parsePreferenceResult({ ...preferences, saved: true }), {
    ...preferences,
    saved: true,
  });
  for (const value of [undefined, {}, { sound: 'yes', usageCountsEnabled: true }]) {
    assert.throws(() => parsePreferences(value));
  }
  for (const saved of [undefined, 'yes', 1]) {
    assert.throws(() => parsePreferenceResult({ ...preferences, saved }));
  }
});
