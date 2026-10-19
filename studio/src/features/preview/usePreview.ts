import { emptyOutlines, parseOutlines, type OutlineState } from './outlineState';
import { receivePreviewKey } from './previewKeys';
import { receiveStyleModifiers } from './styleModifiers';
import {
  receiveCanvasReply,
  setCanvasFrame,
  noteCanvasReady,
} from '../../../vendor/stacki/src/editor/canvasQuery';
import { useCallback, useEffect, useRef, useState } from 'react';
import { request, routeFor } from '../project/projectClient';
import { record, string } from '../../shared/validation';

export function usePreview(
  file: string,
  onSelect: (id: string, occurrence?: number) => void,
  report: (error: unknown) => void,
  enabled = true,
  onOpen?: (id: string, occurrence: number) => void,
) {
  const [outlines, setOutlines] = useState(emptyOutlines);
  const frame = useRef<HTMLIFrameElement>(null);
  const loadListeners = useRef(new Set<() => void>());
  const subscribeLoad = useCallback((listener: () => void) => {
    loadListeners.current.add(listener);
    listener();
    return () => {
      loadListeners.current.delete(listener);
    };
  }, []);
  const reveal = useRef<{ type: string; id: string; occurrence: number }>();
  const callbacks = useRef({ onSelect, onOpen, report });
  callbacks.current = { onSelect, onOpen, report };
  const target = usePreviewTarget(file, enabled, callbacks);
  usePreviewMessages(frame, target, callbacks, setOutlines);

  return {
    frame,
    outlines,
    subscribeLoad,
    reveal: (id: string, occurrence = 0) => {
      reveal.current = { type: 'studio:reveal', id, occurrence };
      postToFrame(frame.current, target?.origin, reveal.current);
    },
    loaded: () => {
      setCanvasFrame({
        postMessage: (message: unknown) => postToFrame(frame.current, target?.origin, message),
      });
      noteCanvasReady();
      // React calls this for the current iframe, including replacements with the same URL.
      for (const listener of loadListeners.current) {
        listener();
      }
      if (reveal.current) {
        postToFrame(frame.current, target?.origin, reveal.current);
      }
    },
    url: target?.url,
    send: (message: unknown) => postToFrame(frame.current, target?.origin, message),
  };
}
function usePreviewMessages(
  frame: React.RefObject<HTMLIFrameElement>,
  target: { url: string; origin: string } | undefined,
  callbacks: React.MutableRefObject<{
    onSelect: (id: string, occurrence?: number) => void;
    onOpen: ((id: string, occurrence: number) => void) | undefined;
    report: (error: unknown) => void;
  }>,
  setOutlines: (state: OutlineState) => void,
) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const patch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (target) {
          frame.current?.contentWindow?.postMessage({ type: 'avb:patch-now' }, target.origin);
        }
      }, 32);
    };
    const receive = (event: MessageEvent) => {
      if (
        !target ||
        event.origin !== target.origin ||
        event.source !== frame.current?.contentWindow
      ) {
        return;
      }
      const outlines = parseOutlines(event.data);
      if (outlines) {
        setOutlines(outlines);
      }
      receiveStudioSignals(event.data, patch);
      if (isMessage(event.data, 'avb:query-result')) {
        receiveCanvasReply(event.data);
      }
      if (isMessage(event.data, 'studio:open')) {
        const data = record(event.data);
        callbacks.current.onOpen?.(string(data['id'], 500), messageOccurrence(data));
      }
      const id = selectionID(event.data);
      if (id !== undefined) {
        const data = record(event.data);
        callbacks.current.onSelect(id, messageOccurrence(data));
      }
    };
    const variant = (event: Event) => {
      if (event instanceof CustomEvent) {
        postToFrame(frame.current, target?.origin, {
          type: 'studio:variant',
          command: event.detail as unknown,
        });
      }
    };
    window.addEventListener('studio:variant-command', variant);
    window.addEventListener('studio:source-updated', patch);
    window.addEventListener('message', receive);
    return () => {
      clearTimeout(timer);
      setCanvasFrame(undefined);
      window.removeEventListener('studio:variant-command', variant);
      window.removeEventListener('studio:source-updated', patch);
      window.removeEventListener('message', receive);
    };
  }, [target, frame, callbacks, setOutlines]);
}
function messageOccurrence(data: Record<string, unknown>) {
  const value = data['occurrence'];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < 10_000
    ? value
    : 0;
}
function receiveStudioSignals(data: unknown, patch: () => void) {
  receiveStyleModifiers(data);
  if (isMessage(data, 'avb:canvas-ready') || isMessage(data, 'studio:css-changed')) {
    noteCanvasReady();
  }
  if (isMessage(data, 'studio:key')) {
    receivePreviewKey(data);
  }
  if (isMessage(data, 'studio:interaction')) {
    window.dispatchEvent(new Event('studio:interaction'));
  }
  if (isMessage(data, 'studio:css-changed') || isMessage(data, 'studio:cms-changed')) {
    window.dispatchEvent(new Event('studio:source-updated'));
  }
  if (isMessage(data, 'studio:invalidate')) {
    window.dispatchEvent(new Event('studio:project-updated'));
    patch();
  }
}
function usePreviewTarget(
  file: string,
  enabled: boolean,
  callbacks: React.MutableRefObject<{ report: (error: unknown) => void }>,
) {
  const [target, setTarget] = useState<{ url: string; origin: string }>();
  useEffect(() => {
    let active = true;
    if (!enabled || !file.startsWith('src/pages/')) {
      setTarget(undefined);
      return;
    }
    void request('/studio/api/preview-url?page=' + encodeURIComponent(routeFor(file)))
      .then((value) => {
        const target = parsePreviewTarget(value);
        if (active) {
          setTarget(target);
        }
      })
      .catch((error: unknown) => callbacks.current.report(error));
    return () => {
      active = false;
    };
  }, [file, enabled, callbacks]);
  return target;
}

function postToFrame(
  frame: HTMLIFrameElement | null,
  origin: string | undefined,
  message: unknown,
) {
  if (origin) {
    frame?.contentWindow?.postMessage(message, origin);
  }
}

export function parsePreviewTarget(value: unknown) {
  const data = record(value);
  const url = string(data['url'], 4000);
  const origin = string(data['origin'], 500);
  const parsed = new URL(url, location.origin);
  if (parsed.origin !== origin || !['https:', 'http:'].includes(parsed.protocol)) {
    throw new Error('Invalid preview address');
  }
  return { url, origin };
}

function selectionID(data: unknown): string | undefined {
  if (
    data &&
    typeof data === 'object' &&
    'type' in data &&
    data.type === 'studio:select' &&
    'id' in data &&
    typeof data.id === 'string'
  ) {
    return data.id;
  }
  return undefined;
}

function isMessage(value: unknown, type: string): boolean {
  return !!value && typeof value === 'object' && 'type' in value && value.type === type;
}
