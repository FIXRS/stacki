import { useEffect, useRef, useState } from 'react';
import { defaultsPreviewTransition } from '../../../shared/properties/previewRoute';

// Keep the same browsing context across defaults entry/exit. Ordinary navigation
// still changes src; refresh and component scripts retain their existing behavior.
export function usePreviewSource(url: string | undefined, send: (message: unknown) => void) {
  const previous = useRef(url);
  const [frameURL, setFrameURL] = useState(url);
  useEffect(() => {
    const before = previous.current;
    previous.current = url;
    if (before === url) {
      return;
    }
    if (before && url && defaultsPreviewTransition(before, url)) {
      send({ type: 'avb:preview-route', url });
    } else {
      setFrameURL(url);
    }
  }, [url, send]);
  return {
    url: frameURL,
    loaded: () => {
      if (url) {
        send({ type: 'avb:preview-route', url });
      }
    },
  };
}
