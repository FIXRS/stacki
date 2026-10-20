// Shared bounds keep the persisted guide and the canvas controls in agreement.
export const GUIDE_LIMITS = {
  columnPickMax: 32,
  columnPickMin: 2,
  colorCharsMax: 64,
  lengthPxMax: 100_000,
  lengthRemMax: 6_000,
  opacityMax: 0.2,
  opacityMin: 0.06,
  opacityStep: 0.01,
  rootFontPxMax: 1_000,
  /** A variable name typed into the menu, with its leading dashes. */
  variableCharsMax: 64,
  /** Four menu variables plus the project's column fallback. */
  variablesMax: 5,
} as const satisfies Record<string, number>;
