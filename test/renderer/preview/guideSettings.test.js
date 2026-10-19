// Goal: a stored guide record from any app version reads back as usable
// settings, and a bad field costs only that field. Methodology: parse a full record,
// then records missing or garbling each field in turn, and check every other
// field survives. The column list and the count picked from it are checked
// together, since a pick only stands while the list offers it. Colours go
// through CSS.supports, which Node lacks, so a stand-in accepts the literal
// colours a browser would.
const test = require('node:test');
const assert = require('node:assert/strict');

globalThis.CSS = {
  supports: (property, value) =>
    property === 'color' && /^(#[0-9a-f]{3,8}|rgba?\([^()]*\)|red)$/i.test(value),
};

const { parseGuideColor, parseGuideSettings } = require('../../helpers/rendererModule')(
  'src/features/preview/guideSettings.ts',
);
const { GUIDE_DEFAULTS, GUIDE_LIMITS } = require('../../helpers/rendererModule')(
  'src/features/preview/guideModel.ts',
);

const STORED = {
  visible: true,
  columns: 16,
  columnChoices: [6, 8, 12, 16],
  columnVariable: '--grid-columns',
  color: '#00ff88',
  opacity: 0.15,
  numbers: false,
  margin: { kind: 'length', length: { amount: 2, unit: 'rem' } },
  gutter: { kind: 'variable', name: '--gap' },
  widthMax: { kind: 'length', length: { amount: 1200, unit: 'px' } },
};

test('a stored record reads back whole', () => {
  assert.deepEqual(parseGuideSettings(STORED), STORED);
  assert.deepEqual(parseGuideSettings({ ...STORED, columns: 'project' }).columns, 'project');
});

test('the guide is off by default, grey at 0.06, numbered, deferring to the project', () => {
  assert.equal(GUIDE_DEFAULTS.visible, false);
  assert.equal(GUIDE_DEFAULTS.color, 'rgb(146, 146, 146)');
  assert.equal(GUIDE_DEFAULTS.opacity, 0.06);
  assert.equal(GUIDE_DEFAULTS.numbers, true);
  assert.equal(GUIDE_DEFAULTS.columns, 'project');
});

test('anything that is not a record is the defaults', () => {
  const PLATFORM_NULL = JSON.parse('null');
  for (const input of [undefined, PLATFORM_NULL, 3, 'guide', true]) {
    assert.deepEqual(parseGuideSettings(input), GUIDE_DEFAULTS);
  }
});

test('a garbled field falls back alone', () => {
  const garbled = {
    visible: 'yes',
    columns: 12.5,
    columnChoices: [6, 6, 12],
    columnVariable: 'cols;color:red',
    color: 'var(--brand)',
    opacity: Number.NaN,
    numbers: 0,
    margin: { kind: 'length', length: { amount: -1, unit: 'px' } },
    gutter: { kind: 'variable', name: 'gap;color:red' },
    widthMax: { kind: 'length', length: { amount: 4, unit: 'em' } },
  };
  for (const [field, bad] of Object.entries(garbled)) {
    const parsed = parseGuideSettings({ ...STORED, [field]: bad });
    assert.deepEqual(parsed[field], GUIDE_DEFAULTS[field], field);
    for (const other of Object.keys(STORED).filter((key) => key !== field)) {
      assert.deepEqual(parsed[other], STORED[other], `${field} kept ${other}`);
    }
  }
});

test('margin, gutter and maximum width are unset by default, and a stored size can be', () => {
  assert.equal(GUIDE_DEFAULTS.margin, undefined);
  assert.equal(GUIDE_DEFAULTS.gutter, undefined);
  assert.equal(GUIDE_DEFAULTS.widthMax, undefined);
  for (const unset of [undefined, 'none', { kind: 'other' }, { kind: 'variable' }]) {
    assert.equal(parseGuideSettings({ ...STORED, margin: unset }).margin, undefined);
  }
});

test('a stored list reads back sorted, and a bad one is the default list', () => {
  const read = (columnChoices) => parseGuideSettings({ ...STORED, columnChoices }).columnChoices;
  assert.deepEqual(read([16, 12, 4]), [4, 12, 16]);
  assert.deepEqual(read([12]), [12]);
  const tooLong = [4, 5, 6, 7, 8, 9, 10, 11, 12];
  assert.equal(tooLong.length, GUIDE_LIMITS.columnChoicesMax + 1);
  for (const bad of [undefined, '12', [6, 8], [3, 12], [12, 25], [12, 7.5], [12, '8'], tooLong]) {
    assert.deepEqual(read(bad), GUIDE_DEFAULTS.columnChoices, JSON.stringify(bad));
  }
});

test('a picked count the list does not offer defers to the project', () => {
  assert.equal(parseGuideSettings({ ...STORED, columns: 13 }).columns, 'project');
  assert.equal(parseGuideSettings({ ...STORED, columns: 24 }).columns, 'project');
  const listed = { ...STORED, columns: 13, columnChoices: [12, 13] };
  assert.equal(parseGuideSettings(listed).columns, 13);
});

test('a stored opacity is pulled back into range', () => {
  assert.equal(parseGuideSettings({ ...STORED, opacity: 2 }).opacity, GUIDE_LIMITS.opacityMax);
  assert.equal(parseGuideSettings({ ...STORED, opacity: 0 }).opacity, GUIDE_LIMITS.opacityMin);
});

test('colours: literal, bounded, never a variable', () => {
  assert.equal(parseGuideColor(' #ff5c5c '), '#ff5c5c');
  assert.equal(parseGuideColor('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
  assert.equal(parseGuideColor(''), undefined);
  assert.equal(parseGuideColor('not a colour'), undefined);
  assert.equal(parseGuideColor('var(--brand)'), undefined);
  assert.equal(parseGuideColor(42), undefined);
  assert.equal(parseGuideColor(`rgb(${' '.repeat(GUIDE_LIMITS.colorCharsMax)}1, 2, 3)`), undefined);
});
