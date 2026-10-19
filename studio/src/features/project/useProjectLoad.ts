import { useCallback, useEffect, useRef, useState } from 'react';
import { loadProject, type Project } from './projectClient';
import { StudioRequestError } from './responseError';

export function useProjectLoad(report: (error: unknown) => void) {
  const [project, setProject] = useState<Project>();
  const [attempt, setAttempt] = useState(0);
  const [failure, setFailure] = useState('');
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController>();
  const refresh = useCallback(() => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setFailure('');
    setRevision((value) => value + 1);
    void openProject(controller.signal, setAttempt)
      .then((value) => {
        if (!controller.signal.aborted) {
          setProject(value);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setFailure(error instanceof Error ? error.message : 'Unable to open your studio.');
          report(error);
        }
      });
  }, [report]);
  useEffect(() => {
    refresh();
    window.addEventListener('studio:project-changed', refresh);
    return () => {
      window.removeEventListener('studio:project-changed', refresh);
      active.current?.abort();
    };
  }, [refresh]);
  return { project, refresh, attempt, failure, revision };
}

async function openProject(signal: AbortSignal, progress: (attempt: number) => void) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    signal.throwIfAborted();
    progress(attempt);
    const timeout = new AbortController();
    const timer = setTimeout(
      () => timeout.abort(new DOMException('Startup timed out', 'TimeoutError')),
      20000,
    );
    try {
      return await loadProject(AbortSignal.any([signal, timeout.signal]));
    } catch (error) {
      signal.throwIfAborted();
      if (
        attempt === 3 ||
        !(error instanceof StudioRequestError) ||
        (error.status !== 0 && error.status < 500)
      ) {
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('Unable to connect to your workspace. Please retry.');
}
