import { useEffect, useState } from 'react';

export function usePreviewLoading(
  url: string | undefined,
  frame: React.RefObject<HTMLIFrameElement>,
  canvas: boolean,
) {
  const [readyKey, setReadyKey] = useState('');
  const [slowKey, setSlowKey] = useState('');
  const [attempt, setAttempt] = useState(0);
  const key = `${url ?? ''}:${canvas}:${attempt}`;
  useEffect(() => {
    const timer = setTimeout(() => setSlowKey(key), 15000);
    const receive = (event: MessageEvent) => {
      if (
        !url ||
        event.source !== frame.current?.contentWindow ||
        event.origin !== new URL(url, location.href).origin
      ) {
        return;
      }
      const data: unknown = event.data;
      if (
        data &&
        typeof data === 'object' &&
        'type' in data &&
        data.type === 'studio:preview-ready'
      ) {
        setReadyKey(key);
      }
    };
    window.addEventListener('message', receive);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', receive);
    };
  }, [url, frame, key]);
  return {
    ready: !!url && readyKey === key,
    slow: slowKey === key,
    attempt,
    loaded: () => setReadyKey(key),
    retry: () => (url ? setAttempt((value) => value + 1) : location.reload()),
  };
}

export function PreviewLoading({
  slow,
  retry,
}: {
  readonly slow: boolean;
  readonly retry: () => void;
}) {
  return (
    <div className="studio-preview-loading" role="status">
      <span className="studio-preview-spinner" aria-hidden="true" />
      <p>{slow ? 'Your preview is taking a little longer to start…' : 'Loading your preview…'}</p>
      {slow && <button onClick={retry}>Retry preview</button>}
    </div>
  );
}
