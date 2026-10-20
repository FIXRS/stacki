import { createContext } from 'react';

// Recipes must retain explicit choices even when they match an Astro fallback.
// Ordinary instances keep omitting redundant fallback values.
export type PropValuePolicy = 'instance' | 'defaults';
export const PropValuePolicyContext = createContext<PropValuePolicy>('instance');
