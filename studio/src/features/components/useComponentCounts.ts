import { useEffect, useState } from 'react';
import { request, type Project } from '../project/projectClient';
import { record, sourcePath } from '../../shared/validation';

function parseCounts(input: unknown): ReadonlyMap<string, number> {
  if (!Array.isArray(input) || input.length > 1000) {
    throw new Error('Invalid component counts');
  }
  const counts = new Map<string, number>();
  for (const value of input) {
    const item = record(value);
    const file = sourcePath(item['file']);
    const total = item['total'];
    if (
      typeof total !== 'number' ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      counts.has(file)
    ) {
      throw new Error('Invalid component count');
    }
    counts.set(file, total);
  }
  return counts;
}

export function useComponentCounts(project: Project, report: (error: unknown) => void) {
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map());
  useEffect(() => {
    let active = true;
    let version = 0;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | undefined;
    const refresh = () => {
      const current = ++version;
      clearTimeout(timer);
      controller?.abort();
      timer = setTimeout(() => {
        controller = new AbortController();
        void request('/studio/api/component-usage', { signal: controller.signal })
          .then(parseCounts)
          .then((value) => {
            if (active && current === version) {
              setCounts(value);
            }
          })
          .catch((error: unknown) => {
            if (active && current === version) {
              report(error);
            }
          });
      }, 200);
    };
    refresh();
    window.addEventListener('studio:source-updated', refresh);
    window.addEventListener('studio:project-updated', refresh);
    return () => {
      active = false;
      clearTimeout(timer);
      controller?.abort();
      window.removeEventListener('studio:source-updated', refresh);
      window.removeEventListener('studio:project-updated', refresh);
    };
  }, [project, report]);
  return counts;
}
