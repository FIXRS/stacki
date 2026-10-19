// Goal: the column guide lands where the project's content box is, takes each
// value from the right source, and refuses what it cannot draw. Methodology:
// resolve hand-built measurements against settings — Lumos's values, a project
// that declares nothing (fluid defaults at both ends and the middle), menu
// lengths and menu variables declared or missing, a capped wide screen — then
// corrupt the inputs (zero columns, gutters wider than the box, lengths and
// names out of bounds) and check the assertions and parsers say so. The menu's
// column list is built, added to and cut back around its bounds: the default
// count, the project's count, and eight entries.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GUIDE_DEFAULTS,
  GUIDE_FLUID_DEFAULTS,
  GUIDE_LIMITS,
  addGuideColumnChoice,
  clampGuideOpacity,
  fluidPx,
  guideColumnOptions,
  guideColumns,
  guideLengthText,
  guideProjectCount,
  guideSizeText,
  guideVariableNames,
  parseGuideColumnCount,
  parseGuideLength,
  parseGuideSize,
  removeGuideColumnChoice,
  resetGuideColumnChoices,
  resolveGuide,
} = require('../../helpers/rendererModule')('src/features/preview/guideModel.ts');

// Lumos at a 1440px viewport: 48px margins, 32px gutters, a 1440px cap.
const LUMOS_WIDE = {
  viewportWidthPx: 1440,
  rootFontPx: 16,
  marginPx: 48,
  gutterPx: 32,
  widthMaxPx: 1440,
  columns: { count: 12, variable: '--_column-count' },
  variablesPx: {},
  variableCounts: {},
};
const NOTHING_DECLARED = {
  viewportWidthPx: 1000,
  rootFontPx: 16,
  marginPx: undefined,
  gutterPx: undefined,
  widthMaxPx: undefined,
  columns: undefined,
  variablesPx: {},
  variableCounts: {},
};
const length = (amount, unit) => ({ kind: 'length', length: { amount, unit } });
const variable = (name) => ({ kind: 'variable', name });

test('project values win for the margin, gutter and maximum width', () => {
  const guide = resolveGuide(LUMOS_WIDE, GUIDE_DEFAULTS);
  assert.deepEqual(guide.margin, { px: 48, source: 'project' });
  assert.deepEqual(guide.gutter, { px: 32, source: 'project' });
  assert.deepEqual(guide.widthMax, { px: 1440, source: 'project' });
  assert.equal(guide.columnCount, 12);
  assert.equal(guide.columnSource, 'project');
});

test('a count picked in Stacki overrides the project count', () => {
  const guide = resolveGuide(LUMOS_WIDE, { ...GUIDE_DEFAULTS, columns: 16 });
  assert.equal(guide.columnCount, 16);
  assert.equal(guide.columnSource, 'stacki');
  assert.deepEqual(guide.margin, { px: 48, source: 'project' });
});

test('a project that declares nothing is drawn from the menu, else the fluid defaults', () => {
  const settings = { ...GUIDE_DEFAULTS, margin: length(2, 'rem') };
  const guide = resolveGuide(NOTHING_DECLARED, settings);
  assert.deepEqual(guide.margin, { px: 32, source: 'fixed' });
  // At 1000px, Lumos's 16→32px gutter range (320→1440px) is at 16 + 16 × 680 / 1120.
  assert.equal(guide.gutter.source, 'default');
  assert.ok(Math.abs(guide.gutter.px - (16 + (16 * 680) / 1120)) < 1e-9);
  assert.equal(guide.widthMax, undefined);
  assert.equal(guide.columnCount, 12);
  assert.equal(guide.columnSource, 'stacki');
});

test('fluid defaults hold their ends outside 320–1440px and follow the root font', () => {
  const margin = GUIDE_FLUID_DEFAULTS.margin;
  assert.equal(fluidPx(margin, 200, 16), 16);
  assert.equal(fluidPx(margin, 320, 16), 16);
  assert.equal(fluidPx(margin, 880, 16), 32);
  assert.equal(fluidPx(margin, 1440, 16), 48);
  assert.equal(fluidPx(margin, 2560, 16), 48);
  // A 20px root scales the rem ends: 20 and 60px, as Lumos's own clamp() would.
  assert.equal(fluidPx(margin, 200, 20), 20);
  assert.equal(fluidPx(margin, 4000, 20), 60);
  assert.throws(() => fluidPx({ pxMin: 2, pxMax: 1 }, 500, 16), /a fluid range grows/);
});

test('a menu variable is used as the page resolves it, and a missing one falls back', () => {
  const metrics = { ...NOTHING_DECLARED, variablesPx: { '--pad': 40, '--wide': 900 } };
  const settings = {
    ...GUIDE_DEFAULTS,
    margin: variable('--pad'),
    gutter: variable('--missing'),
    widthMax: variable('--wide'),
  };
  const guide = resolveGuide(metrics, settings);
  assert.deepEqual(guide.margin, { px: 40, source: 'variable' });
  assert.equal(guide.gutter.source, 'default');
  assert.deepEqual(guide.widthMax, { px: 900, source: 'variable' });
  const missingCap = resolveGuide(metrics, { ...settings, widthMax: variable('--none') });
  assert.equal(missingCap.widthMax, undefined);
});

test('the menu outranks the project, whose value is the default it falls back to', () => {
  const metrics = { ...LUMOS_WIDE, variablesPx: { '--pad': 10 } };
  const settings = {
    ...GUIDE_DEFAULTS,
    margin: variable('--pad'),
    gutter: length(1, 'rem'),
    widthMax: length(1000, 'px'),
  };
  const guide = resolveGuide(metrics, settings);
  assert.deepEqual(guide.margin, { px: 10, source: 'variable' });
  assert.deepEqual(guide.gutter, { px: 16, source: 'fixed' });
  assert.deepEqual(guide.widthMax, { px: 1000, source: 'fixed' });
  // A menu variable the page does not declare falls back to the project's value.
  const missing = resolveGuide(metrics, { ...settings, margin: variable('--missing') });
  assert.deepEqual(missing.margin, { px: 48, source: 'project' });
  // A menu maximum width that caps nothing falls back to the project's too.
  const empty = resolveGuide(metrics, { ...settings, widthMax: length(0, 'px') });
  assert.deepEqual(empty.widthMax, { px: 1440, source: 'project' });
});

test('typed values: a length, a variable name or var(), anything else refused', () => {
  assert.deepEqual(parseGuideSize('32px'), length(32, 'px'));
  assert.deepEqual(parseGuideSize('--pad'), variable('--pad'));
  assert.deepEqual(parseGuideSize(' var( --container_2 ) '), variable('--container_2'));
  for (const text of ['', '-pad', '--', '--a b', 'var(--a', 'var(pad)', '--a;color:red', '4em']) {
    assert.equal(parseGuideSize(text), undefined, text);
  }
  const longest = `--${'a'.repeat(GUIDE_LIMITS.variableCharsMax - 2)}`;
  assert.deepEqual(parseGuideSize(longest), variable(longest));
  assert.equal(parseGuideSize(`${longest}a`), undefined);
  assert.equal(guideSizeText(variable('--pad')), 'var(--pad)');
  assert.equal(guideSizeText(length(2, 'rem')), '2rem');
});

test('the frame is asked about each menu variable once', () => {
  const settings = {
    ...GUIDE_DEFAULTS,
    margin: variable('--pad'),
    gutter: variable('--pad'),
    widthMax: length(1200, 'px'),
  };
  assert.deepEqual(guideVariableNames(settings), ['--pad']);
  assert.deepEqual(guideVariableNames(GUIDE_DEFAULTS), []);
  const counted = { ...settings, gutter: variable('--gap'), columnVariable: '--cols' };
  assert.deepEqual(guideVariableNames(counted), ['--pad', '--gap', '--cols']);
});

test('the project count: the menu variable as a count, then the known ones, then 12', () => {
  const ownVariable = { ...GUIDE_DEFAULTS, columnVariable: '--cols' };
  const declared = { ...LUMOS_WIDE, variableCounts: { '--cols': 10 } };
  assert.equal(guideProjectCount(declared, ownVariable), 10);
  assert.equal(resolveGuide(declared, ownVariable).columnCount, 10);
  assert.equal(resolveGuide(declared, ownVariable).columnSource, 'project');
  // Undeclared, or not a whole number, the variable gives way to the known ones.
  const undeclared = { ...LUMOS_WIDE, variableCounts: { '--cols': undefined } };
  assert.equal(guideProjectCount(undeclared, ownVariable), 12);
  assert.equal(guideProjectCount(NOTHING_DECLARED, ownVariable), undefined);
  assert.equal(resolveGuide(NOTHING_DECLARED, ownVariable).columnCount, 12);
  assert.equal(resolveGuide(NOTHING_DECLARED, ownVariable).columnSource, 'stacki');
  // A count picked in the menu still wins over the variable.
  assert.equal(resolveGuide(declared, { ...ownVariable, columns: 16 }).columnCount, 16);
});

test('a project count outside 4 to 24 gives way, from either variable', () => {
  const ownVariable = { ...GUIDE_DEFAULTS, columnVariable: '--cols' };
  for (const count of [3, 25, 40]) {
    const own = { ...LUMOS_WIDE, variableCounts: { '--cols': count } };
    assert.equal(guideProjectCount(own, ownVariable), 12, `own ${count}`);
    const detected = { ...NOTHING_DECLARED, columns: { count, variable: '--site-columns' } };
    assert.equal(guideProjectCount(detected, GUIDE_DEFAULTS), undefined, `detected ${count}`);
    assert.equal(resolveGuide(detected, GUIDE_DEFAULTS).columnCount, 12);
    assert.equal(resolveGuide(detected, GUIDE_DEFAULTS).columnSource, 'stacki');
  }
  const edges = { ...NOTHING_DECLARED, variableCounts: { '--cols': 4 } };
  assert.equal(guideProjectCount(edges, ownVariable), GUIDE_LIMITS.columnPickMin);
  const top = { ...NOTHING_DECLARED, columns: { count: 24, variable: '--site-columns' } };
  assert.equal(guideProjectCount(top, GUIDE_DEFAULTS), GUIDE_LIMITS.columnPickMax);
});

test('a maximum width the page resolves to nothing caps nothing', () => {
  const guide = resolveGuide({ ...LUMOS_WIDE, widthMaxPx: 0 }, GUIDE_DEFAULTS);
  assert.equal(guide.widthMax, undefined);
});

test('columns fill the content box between the margins, gutters between them', () => {
  const columns = guideColumns(resolveGuide(LUMOS_WIDE, GUIDE_DEFAULTS));
  assert.equal(columns.length, 12);
  // 1440 − 2 × 48 = 1344; less 11 gutters of 32 = 992; twelve columns of 82.67.
  assert.equal(columns[0].xPx, 48);
  assert.ok(Math.abs(columns[0].widthPx - 992 / 12) < 1e-9);
  const last = columns[11];
  assert.ok(Math.abs(last.xPx + last.widthPx - (1440 - 48)) < 1e-9);
  assert.ok(Math.abs(columns[1].xPx - (columns[0].xPx + columns[0].widthPx) - 32) < 1e-9);
});

test('past the maximum width the content box stays centred', () => {
  const guide = resolveGuide({ ...LUMOS_WIDE, viewportWidthPx: 2000 }, GUIDE_DEFAULTS);
  const columns = guideColumns(guide);
  assert.equal(columns[0].xPx, (2000 - 1440) / 2);
  const last = columns[11];
  assert.ok(Math.abs(last.xPx + last.widthPx - (2000 + 1440) / 2) < 1e-9);
});

test('gutters that leave no room draw no columns', () => {
  const crowded = { ...LUMOS_WIDE, viewportWidthPx: 400, gutterPx: 40 };
  assert.deepEqual(guideColumns(resolveGuide(crowded, { ...GUIDE_DEFAULTS, columns: 24 })), []);
  const marginsOnly = { ...LUMOS_WIDE, viewportWidthPx: 80 };
  assert.deepEqual(guideColumns(resolveGuide(marginsOnly, GUIDE_DEFAULTS)), []);
});

test('column counts the guide cannot draw are assertion failures', () => {
  const guide = resolveGuide(LUMOS_WIDE, GUIDE_DEFAULTS);
  assert.throws(() => guideColumns({ ...guide, columnCount: 2.5 }), /column count is an integer/);
  for (const columnCount of [0, 3, 25]) {
    assert.throws(() => guideColumns({ ...guide, columnCount }), /column count within range/);
  }
  assert.throws(() => resolveGuide({ ...LUMOS_WIDE, rootFontPx: 0 }, GUIDE_DEFAULTS), /root font/);
});

test('typed lengths take px or rem, a bare number is px, anything else is refused', () => {
  assert.deepEqual(parseGuideLength('48px'), { amount: 48, unit: 'px' });
  assert.deepEqual(parseGuideLength(' 3 REM '), { amount: 3, unit: 'rem' });
  assert.deepEqual(parseGuideLength('24'), { amount: 24, unit: 'px' });
  assert.deepEqual(parseGuideLength('.5rem'), { amount: 0.5, unit: 'rem' });
  for (const text of ['', 'px', '-4px', '4em', '4 px rem', 'var(--x)', '1e3px', 'Infinitypx']) {
    assert.equal(parseGuideLength(text), undefined, text);
  }
  assert.equal(parseGuideLength(`${GUIDE_LIMITS.lengthPxMax + 1}px`), undefined);
  assert.equal(parseGuideLength(`${GUIDE_LIMITS.lengthRemMax + 1}rem`), undefined);
  assert.deepEqual(parseGuideLength(`${GUIDE_LIMITS.lengthPxMax}px`), {
    amount: GUIDE_LIMITS.lengthPxMax,
    unit: 'px',
  });
});

test('lengths read back as they were typed', () => {
  assert.equal(guideLengthText({ amount: 1.23456, unit: 'rem' }), '1.235rem');
  assert.equal(guideLengthText({ amount: 32, unit: 'px' }), '32px');
});

test('the default list is 6, 8, 10, 12 and 16', () => {
  assert.deepEqual(GUIDE_DEFAULTS.columnChoices, [6, 8, 10, 12, 16]);
});

test('a typed count is a whole number within 4 and 24, else refused', () => {
  assert.equal(parseGuideColumnCount('4'), GUIDE_LIMITS.columnPickMin);
  assert.equal(parseGuideColumnCount('10'), 10);
  assert.equal(parseGuideColumnCount('24'), GUIDE_LIMITS.columnPickMax);
  for (const text of [
    '0',
    '1',
    '3',
    '25',
    '99',
    '100',
    '04x',
    '',
    ' 8',
    'ten',
    '-8',
    '8.5',
    '8,5',
  ]) {
    assert.equal(parseGuideColumnCount(text), undefined, text);
  }
});

test('the list names the count the guide defers to, once and in order', () => {
  const list = [6, 8, 10, 12, 16];
  const labels = (projectCount) =>
    guideColumnOptions(list, projectCount).map(({ count, source }) => `${count} ${source}`);
  assert.deepEqual(labels(undefined), ['6 list', '8 list', '10 list', '12 default', '16 list']);
  assert.deepEqual(labels(12), ['6 list', '8 list', '10 list', '12 project', '16 list']);
  assert.deepEqual(labels(10), ['6 list', '8 list', '10 project', '12 list', '16 list']);
  assert.deepEqual(labels(14).slice(3, 6), ['12 list', '14 project', '16 list']);
  assert.throws(() => guideColumnOptions([6, 8], undefined), /keeps the default/);
});

test('adding stops at eight entries, the project count included', () => {
  const seven = [4, 6, 8, 10, 12, 16, 20];
  assert.deepEqual(addGuideColumnChoice(seven, 24, undefined), [4, 6, 8, 10, 12, 16, 20, 24]);
  assert.deepEqual(addGuideColumnChoice(seven, 24, 14), seven);
  assert.deepEqual(addGuideColumnChoice(seven, 14, 14), [4, 6, 8, 10, 12, 14, 16, 20]);
  assert.equal(addGuideColumnChoice(seven, 8, undefined), seven);
  assert.throws(() => addGuideColumnChoice(seven, 3, undefined), /is a pick/);
  // A project count added once the list is full leaves nine entries until one goes.
  const eight = [4, 6, 8, 10, 12, 16, 20, 24];
  assert.equal(guideColumnOptions(eight, 14).length, GUIDE_LIMITS.columnChoicesMax + 1);
  assert.equal(addGuideColumnChoice(eight, 18, 14), eight);
});

test('removing a count or resetting the list drops a pick it no longer offers', () => {
  const picked = { ...GUIDE_DEFAULTS, columns: 8 };
  assert.deepEqual(removeGuideColumnChoice(picked, 6).columnChoices, [8, 10, 12, 16]);
  assert.equal(removeGuideColumnChoice(picked, 6).columns, 8);
  assert.equal(removeGuideColumnChoice(picked, 8).columns, 'project');
  assert.throws(() => removeGuideColumnChoice(picked, 12), /stays in the list/);
  assert.throws(() => removeGuideColumnChoice(picked, 20), /is in the list/);
  const custom = { ...GUIDE_DEFAULTS, columns: 20, columnChoices: [12, 20] };
  assert.deepEqual(resetGuideColumnChoices(custom).columnChoices, GUIDE_DEFAULTS.columnChoices);
  assert.equal(resetGuideColumnChoices(custom).columns, 'project');
  assert.equal(resetGuideColumnChoices({ ...custom, columns: 12 }).columns, 12);
});

test('opacity stays within 0.06 and 0.2, on 0.01 steps', () => {
  assert.equal(clampGuideOpacity(0.1), 0.1);
  assert.equal(clampGuideOpacity(0.123), 0.12);
  assert.equal(clampGuideOpacity(0), GUIDE_LIMITS.opacityMin);
  assert.equal(clampGuideOpacity(0.05), 0.06);
  assert.equal(clampGuideOpacity(0.9), GUIDE_LIMITS.opacityMax);
  assert.equal(clampGuideOpacity(0.19999), 0.2);
});
