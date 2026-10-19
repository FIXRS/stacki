import { createLiveValue } from '../../../vendor/stacki/src/ui/liveValue';
import type { SpacingHover } from '../../../vendor/stacki/src/features/preview/PreviewOverlays';
export const spacingHover = createLiveValue<SpacingHover | undefined>(undefined);
