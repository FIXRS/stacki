// Preview provenance is descriptive until its path matches the current source tree.
// Both processes share the parser so page scripts cannot forge unchecked metadata.
import { object, optional, pathText, text } from '../core/boundary';

export const parseStyleSource = object({ label: text, path: optional(pathText) });
export type StyleSource = ReturnType<typeof parseStyleSource>;
