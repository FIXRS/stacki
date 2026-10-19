// The column guide: what it is drawn from, and where each column falls.
//
// Each of the margin, the gutter and the maximum width is taken, in order,
// from the menu (a fixed length, or a variable of the project's own read from
// the page), then from the project's Lumos variable, measured in the frame at
// the current preview width (electron/preload/frameGuide.ts), then, for the
// margin and gutter, from Lumos's fluid starting ranges. The project's value
// is a default: the guide only draws and never writes to the project, and
// resetting a field brings that value back. The column count works the same
// way, the menu's pick over the project's.

import { assert } from '../../../shared/core/assert';

export const GUIDE_LIMITS = {
  /** The menu's column list, the count it defers to included. */
  columnChoicesMax: 8,
  columnPickMax: 24,
  columnPickMin: 4,
  colorCharsMax: 64,
  lengthPxMax: 100_000,
  lengthRemMax: 6_000,
  opacityMax: 0.2,
  opacityMin: 0.06,
  opacityStep: 0.01,
  rootFontPxMax: 1_000,
  /** A variable name typed into the menu, with its leading dashes. */
  variableCharsMax: 64,
  /** Margin, gutter, maximum width and column count: one variable each at most. */
  variablesMax: 4,
} as const satisfies Record<string, number>;

/** The counts the menu offers until its list is edited. */
export const GUIDE_COLUMN_CHOICES_DEFAULT: readonly number[] = [6, 8, 10, 12, 16];
/** The project's count (or the default when it has none), or a count picked in the menu. */
export type GuideColumnSetting = 'project' | number;

/**
 * The count used when the project declares none and the setting defers to it.
 * The menu always offers it: its list can lose every other count, never this one.
 */
export const GUIDE_COLUMN_COUNT_DEFAULT = 12;
/** The numbers are the column colour, this much more opaque than the column. */
export const GUIDE_NUMBER_OPACITY = 0.5;

/** The variables a project count is read from, in the order they are tried. */
export const GUIDE_COLUMN_VARIABLES = [
  '--site-column-count',
  '--site-columns',
  '--_column-count',
] as const;
export type GuideColumnVariable = (typeof GUIDE_COLUMN_VARIABLES)[number];

export type GuideLengthUnit = 'px' | 'rem';
export interface GuideLength {
  readonly amount: number;
  readonly unit: GuideLengthUnit;
}

/** What the menu holds for a margin, gutter or maximum width. */
export type GuideSize =
  | { readonly kind: 'length'; readonly length: GuideLength }
  | { readonly kind: 'variable'; readonly name: string };

/**
 * The variables a Lumos project declares the layout with, measured by the
 * frame under these names (electron/preload/frameGuide.ts keeps its own copy).
 */
export const GUIDE_PROJECT_VARIABLES = {
  margin: '--site-margin',
  gutter: '--site-gutter',
  widthMax: '--max-width-main',
} as const;

/** A custom property name the menu accepts: two dashes, then a CSS identifier. */
export const GUIDE_VARIABLE_PATTERN = /^--[A-Za-z0-9_-]+$/;

/** A Lumos fluid range: its size at the narrow and the wide end, in px at a 16px root. */
export interface GuideFluidRange {
  readonly pxMin: number;
  readonly pxMax: number;
}

/** Lumos's starting ranges, used when neither the project nor the menu sets a value. */
export const GUIDE_FLUID_DEFAULTS = {
  margin: { pxMin: 16, pxMax: 48 },
  gutter: { pxMin: 16, pxMax: 32 },
} as const satisfies Record<string, GuideFluidRange>;
// The viewport widths a Lumos fluid value runs between, and the root size its
// rem values are written for.
const LUMOS_VIEWPORT_PX_MIN = 320;
const LUMOS_VIEWPORT_PX_MAX = 1440;
const LUMOS_ROOT_FONT_PX = 16;

/** What the frame measured, in CSS pixels of the frame. Absent: not declared. */
export interface GuideMetrics {
  readonly viewportWidthPx: number;
  readonly rootFontPx: number;
  readonly marginPx: number | undefined;
  readonly gutterPx: number | undefined;
  readonly widthMaxPx: number | undefined;
  readonly columns: { readonly count: number; readonly variable: GuideColumnVariable } | undefined;
  /** The menu's own variables, by name; a name the page does not declare is absent. */
  readonly variablesPx: Readonly<Record<string, number | undefined>>;
  /** The same names read as column counts; absent unless a whole number. */
  readonly variableCounts: Readonly<Record<string, number | undefined>>;
}

export interface GuideSettings {
  readonly visible: boolean;
  readonly columns: GuideColumnSetting;
  /** The menu's list: sorted, each count once, within the pick range and the list bound. */
  readonly columnChoices: readonly number[];
  /** The project's count is read from this variable; absent, from the ones the guide knows. */
  readonly columnVariable: string | undefined;
  readonly color: string;
  readonly opacity: number;
  readonly numbers: boolean;
  /** Absent: the fluid default. */
  readonly margin: GuideSize | undefined;
  /** Absent: the fluid default. */
  readonly gutter: GuideSize | undefined;
  /** Absent: the content box is never capped. */
  readonly widthMax: GuideSize | undefined;
}

export const GUIDE_DEFAULTS: GuideSettings = {
  visible: false,
  columns: 'project',
  columnChoices: GUIDE_COLUMN_CHOICES_DEFAULT,
  columnVariable: undefined,
  // A neutral grey, barely there.
  color: 'rgb(146, 146, 146)',
  opacity: 0.06,
  numbers: true,
  margin: undefined,
  gutter: undefined,
  widthMax: undefined,
};

/** Where a value came from: Lumos's variable, the menu's variable or length, or the default. */
export type GuideSource = 'project' | 'variable' | 'fixed' | 'default';
export interface GuideValue {
  readonly px: number;
  readonly source: GuideSource;
}
export type GuideColumnSource = 'project' | 'stacki';

/** Every value the guide is drawn with, and where each one came from. */
export interface ResolvedGuide {
  readonly viewportWidthPx: number;
  readonly rootFontPx: number;
  readonly columnCount: number;
  readonly columnSource: GuideColumnSource;
  readonly margin: GuideValue;
  readonly gutter: GuideValue;
  /** Absent: the content box is never capped. */
  readonly widthMax: GuideValue | undefined;
}

/** One column's horizontal extent, in CSS pixels of the frame. */
export interface GuideColumn {
  readonly xPx: number;
  readonly widthPx: number;
}

export function resolveGuide(metrics: GuideMetrics, settings: GuideSettings): ResolvedGuide {
  assert(metrics.viewportWidthPx >= 0, 'Guide: viewport width is nonnegative');
  assert(metrics.rootFontPx > 0, 'Guide: root font size is positive');
  return {
    viewportWidthPx: metrics.viewportWidthPx,
    rootFontPx: metrics.rootFontPx,
    ...columnCountOf(metrics, settings),
    margin: spacingValue(metrics.marginPx, settings.margin, metrics, GUIDE_FLUID_DEFAULTS.margin),
    gutter: spacingValue(metrics.gutterPx, settings.gutter, metrics, GUIDE_FLUID_DEFAULTS.gutter),
    widthMax: widthMaxValue(metrics, settings.widthMax),
  };
}

/**
 * The columns of the content box: as wide as the viewport less a margin on
 * each side, capped at the maximum width and centred — Lumos's `.container`.
 * Empty when the gutters leave no room for a column.
 */
export function guideColumns(guide: ResolvedGuide): readonly GuideColumn[] {
  assert(Number.isSafeInteger(guide.columnCount), 'Guide: column count is an integer');
  assert(guide.columnCount >= GUIDE_LIMITS.columnPickMin, 'Guide: column count within range');
  assert(guide.columnCount <= GUIDE_LIMITS.columnPickMax, 'Guide: column count within range');
  const available = Math.max(0, guide.viewportWidthPx - 2 * guide.margin.px);
  const widthMax = guide.widthMax?.px ?? Number.POSITIVE_INFINITY;
  const contentWidthPx = Math.min(available, widthMax);
  const guttersPx = guide.gutter.px * (guide.columnCount - 1);
  const columnWidthPx = (contentWidthPx - guttersPx) / guide.columnCount;
  if (columnWidthPx > 0) {
    const leftPx = (guide.viewportWidthPx - contentWidthPx) / 2;
    const columns = Array.from({ length: guide.columnCount }, (_, index) => ({
      xPx: leftPx + index * (columnWidthPx + guide.gutter.px),
      widthPx: columnWidthPx,
    }));
    assert(columns.length === guide.columnCount, 'Guide: one box per column');
    return columns;
  }
  return [];
}

export function lengthPx(length: GuideLength, rootFontPx: number): number {
  assert(length.amount >= 0, 'Guide: length is nonnegative');
  assert(rootFontPx > 0, 'Guide: root font size is positive');
  return length.unit === 'px' ? length.amount : length.amount * rootFontPx;
}

const LENGTH_PATTERN = /^(\d+(?:\.\d+)?|\.\d+)\s*(px|rem)?$/i;

/** A length typed into the menu: a number in px or rem; a bare number is px. */
export function parseGuideLength(text: string): GuideLength | undefined {
  const match = LENGTH_PATTERN.exec(text.trim());
  if (match === null) {
    return undefined;
  }
  const amount = Number.parseFloat(match[1] ?? '');
  const unit = (match[2] ?? 'px').toLowerCase() === 'rem' ? 'rem' : 'px';
  const maximum = unit === 'px' ? GUIDE_LIMITS.lengthPxMax : GUIDE_LIMITS.lengthRemMax;
  if (Number.isFinite(amount)) {
    return amount <= maximum ? { amount, unit } : undefined;
  }
  return undefined;
}

export function guideLengthText(length: GuideLength): string {
  return `${roundTo(length.amount, 1_000)}${length.unit}`;
}

const VARIABLE_REFERENCE_PATTERN = /^var\(\s*(--[^\s()]+)\s*\)$/;

/**
 * A value typed into the menu: a length, or a variable of the project's own,
 * written as `--name` or `var(--name)`. Undefined for anything else.
 */
export function parseGuideSize(text: string): GuideSize | undefined {
  const trimmed = text.trim();
  const reference = VARIABLE_REFERENCE_PATTERN.exec(trimmed)?.[1] ?? trimmed;
  if (reference.startsWith('--')) {
    const name = parseGuideVariableName(reference);
    return name === undefined ? undefined : { kind: 'variable', name };
  }
  const length = parseGuideLength(trimmed);
  return length === undefined ? undefined : { kind: 'length', length };
}

/** A custom property name, within the length bound, or undefined. */
export function parseGuideVariableName(input: unknown): string | undefined {
  if (typeof input !== 'string') {
    return undefined;
  }
  if (input.length > GUIDE_LIMITS.variableCharsMax) {
    return undefined;
  }
  return GUIDE_VARIABLE_PATTERN.test(input) ? input : undefined;
}

/** A menu value as the field shows it: the length as typed, a variable as `var()`. */
export function guideSizeText(size: GuideSize): string {
  switch (size.kind) {
    case 'length':
      return guideLengthText(size.length);
    case 'variable':
      return `var(${size.name})`;
    default: {
      const exhaustive: never = size;
      return exhaustive;
    }
  }
}

/** The variables the frame has to measure for these settings, each once. */
export function guideVariableNames(settings: GuideSettings): readonly string[] {
  const names = new Set<string>();
  for (const size of [settings.margin, settings.gutter, settings.widthMax]) {
    if (size?.kind === 'variable') {
      names.add(size.name);
    }
  }
  if (settings.columnVariable !== undefined) {
    names.add(settings.columnVariable);
  }
  assert(names.size <= GUIDE_LIMITS.variablesMax, 'Guide: one variable per value at most');
  return [...names];
}

/**
 * A Lumos fluid value at this viewport width: Lumos's own `clamp()`, growing
 * linearly from its narrow-end size at 320px to its wide-end size at 1440px.
 * Its rem terms follow the root font size; its vw term follows the viewport.
 */
export function fluidPx(range: GuideFluidRange, viewportWidthPx: number, rootFontPx: number) {
  assert(range.pxMin <= range.pxMax, 'Guide: a fluid range grows');
  assert(rootFontPx > 0, 'Guide: root font size is positive');
  const viewportSpanPx = LUMOS_VIEWPORT_PX_MAX - LUMOS_VIEWPORT_PX_MIN;
  const slope = (range.pxMax - range.pxMin) / viewportSpanPx;
  const remScale = rootFontPx / LUMOS_ROOT_FONT_PX;
  const preferredPx = (range.pxMin - slope * LUMOS_VIEWPORT_PX_MIN) * remScale;
  const valuePx = preferredPx + slope * viewportWidthPx;
  return Math.min(range.pxMax * remScale, Math.max(range.pxMin * remScale, valuePx));
}

/** A fluid range as the field's placeholder reads it. */
export function fluidText(range: GuideFluidRange): string {
  return `Fluid ${range.pxMin}–${range.pxMax}px`;
}

/** An opacity on the menu's own scale: clamped to its range, on its step. */
export function clampGuideOpacity(value: number): number {
  const stepped = Math.round(value / GUIDE_LIMITS.opacityStep) * GUIDE_LIMITS.opacityStep;
  const clamped = Math.min(GUIDE_LIMITS.opacityMax, Math.max(GUIDE_LIMITS.opacityMin, stepped));
  return roundTo(clamped, 100);
}

/**
 * The project's column count: from the menu's variable when the page declares
 * it as a count, else from the variables the guide knows. Either one counts
 * only within the menu's own range. Undefined for none.
 */
export function guideProjectCount(
  metrics: GuideMetrics,
  settings: Pick<GuideSettings, 'columnVariable'>,
): number | undefined {
  if (settings.columnVariable !== undefined) {
    const declared = metrics.variableCounts[settings.columnVariable];
    if (isGuideColumnPick(declared)) {
      return declared;
    }
  }
  const detected = metrics.columns?.count;
  return isGuideColumnPick(detected) ? detected : undefined;
}

/** One entry of the menu's column list; `project` and `default` are the count it defers to. */
export interface GuideColumnOption {
  readonly count: number;
  readonly source: 'project' | 'default' | 'list';
}

/** A count the menu takes: a whole number within its range. */
export function isGuideColumnPick(value: unknown): value is number {
  if (typeof value !== 'number') {
    return false;
  }
  if (!Number.isSafeInteger(value)) {
    return false;
  }
  if (value < GUIDE_LIMITS.columnPickMin) {
    return false;
  }
  return value <= GUIDE_LIMITS.columnPickMax;
}

// The digits of a count up to the pick maximum, and nothing else.
const COUNT_PATTERN = /^\d{1,2}$/;

/** A count typed into the menu: a whole number within the pick range, else undefined. */
export function parseGuideColumnCount(text: string): number | undefined {
  assert(String(GUIDE_LIMITS.columnPickMax).length <= 2, 'Guide: the pattern holds every pick');
  if (!COUNT_PATTERN.test(text)) {
    return undefined;
  }
  const count = Number.parseInt(text, 10);
  return isGuideColumnPick(count) ? count : undefined;
}

/**
 * A stored column list, or undefined when it is not one: each count a pick,
 * once, the default count among them, within the list bound. Sorted.
 */
export function parseGuideColumnChoices(input: unknown): readonly number[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }
  const entries: readonly unknown[] = input;
  if (entries.length > GUIDE_LIMITS.columnChoicesMax) {
    return undefined;
  }
  const counts = new Set<number>();
  for (const entry of entries) {
    if (!isGuideColumnPick(entry)) {
      return undefined;
    }
    counts.add(entry);
  }
  if (counts.size < entries.length) {
    return undefined;
  }
  return counts.has(GUIDE_COLUMN_COUNT_DEFAULT) ? sortedCounts(counts) : undefined;
}

/**
 * The menu's entries in order: the list, with the count the setting defers to
 * (the project's, else the default) among them once. A project count outside
 * the list is still offered, so it can make the list one longer.
 */
export function guideColumnOptions(
  choices: readonly number[],
  projectCount: number | undefined,
): readonly GuideColumnOption[] {
  assert(choices.includes(GUIDE_COLUMN_COUNT_DEFAULT), 'Guide: the list keeps the default');
  assert(choices.length <= GUIDE_LIMITS.columnChoicesMax, 'Guide: the list within its bound');
  const deferred = projectCount ?? GUIDE_COLUMN_COUNT_DEFAULT;
  const counts = sortedCounts(new Set([...choices, deferred]));
  return counts.map((count) => ({ count, source: columnOptionSource(count, projectCount) }));
}

/** The list with `count` added, or unchanged when it is there already or the menu is full. */
export function addGuideColumnChoice(
  choices: readonly number[],
  count: number,
  projectCount: number | undefined,
): readonly number[] {
  assert(isGuideColumnPick(count), 'Guide: an added count is a pick');
  if (choices.includes(count)) {
    return choices;
  }
  const next = sortedCounts(new Set([...choices, count]));
  if (next.length > GUIDE_LIMITS.columnChoicesMax) {
    return choices;
  }
  const full = guideColumnOptions(next, projectCount).length > GUIDE_LIMITS.columnChoicesMax;
  return full ? choices : next;
}

/** The settings without `count` in the list; a guide drawn with it goes back to the project's. */
export function removeGuideColumnChoice(settings: GuideSettings, count: number): GuideSettings {
  assert(count !== GUIDE_COLUMN_COUNT_DEFAULT, 'Guide: the default count stays in the list');
  assert(settings.columnChoices.includes(count), 'Guide: a removed count is in the list');
  const columnChoices = settings.columnChoices.filter((choice) => choice !== count);
  const columns = settings.columns === count ? 'project' : settings.columns;
  return { ...settings, columns, columnChoices };
}

/** The settings with the default list back; a pick it lacks goes back to the project's. */
export function resetGuideColumnChoices(settings: GuideSettings): GuideSettings {
  const columnChoices = GUIDE_COLUMN_CHOICES_DEFAULT;
  assert(columnChoices.includes(GUIDE_COLUMN_COUNT_DEFAULT), 'Guide: the default list keeps it');
  if (settings.columns === 'project') {
    return { ...settings, columnChoices };
  }
  const columns = columnChoices.includes(settings.columns) ? settings.columns : 'project';
  return { ...settings, columns, columnChoices };
}

function columnOptionSource(
  count: number,
  projectCount: number | undefined,
): GuideColumnOption['source'] {
  if (projectCount === undefined) {
    return count === GUIDE_COLUMN_COUNT_DEFAULT ? 'default' : 'list';
  }
  return count === projectCount ? 'project' : 'list';
}

function sortedCounts(counts: ReadonlySet<number>): readonly number[] {
  return [...counts].sort((left, right) => left - right);
}

// A count picked in Stacki; else the project's, from the menu's variable when
// the page declares it as a count, then from the variables the guide knows;
// else the default.
function columnCountOf(
  metrics: GuideMetrics,
  settings: GuideSettings,
): Pick<ResolvedGuide, 'columnCount' | 'columnSource'> {
  if (settings.columns !== 'project') {
    return { columnCount: settings.columns, columnSource: 'stacki' };
  }
  const projectCount = guideProjectCount(metrics, settings);
  if (projectCount === undefined) {
    return { columnCount: GUIDE_COLUMN_COUNT_DEFAULT, columnSource: 'stacki' };
  }
  return { columnCount: projectCount, columnSource: 'project' };
}

// A margin or gutter: the menu's, else the project's own, else Lumos's fluid
// starting range at this width. A menu variable the page does not declare
// falls through to the next source.
function spacingValue(
  projectPx: number | undefined,
  setting: GuideSize | undefined,
  metrics: GuideMetrics,
  fluid: GuideFluidRange,
): GuideValue {
  const chosen = settingValue(setting, metrics);
  if (chosen !== undefined) {
    return chosen;
  }
  if (projectPx !== undefined) {
    return { px: projectPx, source: 'project' };
  }
  const px = fluidPx(fluid, metrics.viewportWidthPx, metrics.rootFontPx);
  return { px, source: 'default' };
}

// The maximum width in the same order as the margin, with no default: the
// content box is then never capped. A width that resolves to nothing (`none`,
// a percentage of an empty probe) caps nothing, so it is skipped too.
function widthMaxValue(
  metrics: GuideMetrics,
  setting: GuideSize | undefined,
): GuideValue | undefined {
  const chosen = settingValue(setting, metrics);
  if (chosen !== undefined) {
    if (chosen.px > 0) {
      return chosen;
    }
  }
  if (metrics.widthMaxPx !== undefined) {
    if (metrics.widthMaxPx > 0) {
      return { px: metrics.widthMaxPx, source: 'project' };
    }
  }
  return undefined;
}

// What the menu sets, in pixels: a length as written, a variable as the page
// resolves it. Undefined when nothing is set or the variable is not declared.
function settingValue(
  setting: GuideSize | undefined,
  metrics: GuideMetrics,
): GuideValue | undefined {
  if (setting === undefined) {
    return undefined;
  }
  switch (setting.kind) {
    case 'length':
      return { px: lengthPx(setting.length, metrics.rootFontPx), source: 'fixed' };
    case 'variable': {
      const px = metrics.variablesPx[setting.name];
      return px === undefined ? undefined : { px, source: 'variable' };
    }
    default: {
      const exhaustive: never = setting;
      return exhaustive;
    }
  }
}

function roundTo(value: number, scale: number): number {
  return Math.round(value * scale) / scale;
}
