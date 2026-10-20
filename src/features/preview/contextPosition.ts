import { record } from '../../../shared/core/boundary';

export interface ContextPoint {
  readonly left: number;
  readonly top: number;
}

// Browser coordinates are CSS pixels; this cap comfortably exceeds supported displays.
const COORDINATE_MAX = 100_000;

export function parseContextPoint(input: unknown): ContextPoint {
  const value = record(input);
  return { left: coordinate(value['left']), top: coordinate(value['top']) };
}

/** Convert frame CSS pixels to the editor viewport, including preview zoom. */
export function frameContextPoint(frame: HTMLIFrameElement, point: ContextPoint): ContextPoint {
  const bounds = frame.getBoundingClientRect();
  const scale = frame.offsetWidth > 0 ? bounds.width / frame.offsetWidth : 1;
  return {
    left: bounds.left + (frame.clientLeft + point.left) * scale,
    top: bounds.top + (frame.clientTop + point.top) * scale,
  };
}

function coordinate(input: unknown): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) {
    throw new Error('Context menu: expected finite coordinate');
  }
  if (input < 0 || input > COORDINATE_MAX) {
    throw new Error('Context menu: coordinate exceeds viewport bounds');
  }
  return input;
}
