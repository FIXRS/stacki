import { useEffect } from 'react';
import {
  astroChangeMessages,
  parseAstroFileChanges,
} from '../../../vendor/stacki/shared/properties/astroFileChanges';

export function useAstroFileNotifications(report: (message: unknown) => void, refresh: () => void) {
  useEffect(() => {
    const events = new EventSource('/studio/api/astro-events');
    events.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') {
        return;
      }
      const input: unknown = JSON.parse(event.data);
      const changes = parseAstroFileChanges(input);
      for (const message of astroChangeMessages(changes)) {
        report(message);
      }
      refresh();
    };
    return () => events.close();
  }, [report, refresh]);
}
