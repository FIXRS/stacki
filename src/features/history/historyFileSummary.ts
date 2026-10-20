import { assert } from '../../../shared/core/assert';
import { BOUNDARY_LIMITS } from '../../../shared/core/boundary';
import type { HistoryCommitFile } from './historyBridge';

export interface HistoryFileSummary {
  readonly added: number;
  readonly deleted: number;
  readonly updated: number;
}

export function summarizeHistoryFiles(files: readonly HistoryCommitFile[]): HistoryFileSummary {
  assert(files.length <= BOUNDARY_LIMITS.itemsMax, 'History files: file limit exceeded');
  // Copies create a new path; renames and type changes update an existing file.
  // Local counters keep the three categories disjoint without allocating lists.
  let added = 0;
  let deleted = 0;
  let updated = 0;
  for (const file of files) {
    switch (file.status) {
      case 'A':
      case 'C':
        added += 1;
        break;
      case 'D':
        deleted += 1;
        break;
      default:
        updated += 1;
    }
  }
  assert(added + deleted + updated === files.length, 'History files: every file is counted once');
  return { added, deleted, updated };
}
