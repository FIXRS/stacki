import { boolean, object } from '../core/boundary';

export function parsePreferenceName(input: unknown): 'sound' | 'usageCountsEnabled' {
  if (input === 'sound' || input === 'usageCountsEnabled') {
    return input;
  }
  throw new Error('Unknown preference');
}

export const parsePreferences = object({ sound: boolean, usageCountsEnabled: boolean });
export const parsePreferenceResult = object({
  sound: boolean,
  usageCountsEnabled: boolean,
  saved: boolean,
});
