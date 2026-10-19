import { readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { safePath } from '../project/projectServer';
import { record, string } from '../../shared/validation';
import type { RepositoryFile } from '../github/github';
import { SerialQueue } from '../../shared/serialQueue';
import { CleanupStore, assetDigest, gitBlob, type AssetBaseline } from './cleanupStore';
import { referencedAssets } from './assetReferences';
import {
  assetPath,
  parseCandidate,
  type CleanupCandidate,
  type CleanupReport,
  type StorageInventory,
} from './cleanupTypes';

export class StorageCleanup {
  readonly store: CleanupStore;
  constructor(
    readonly root: string,
    private readonly coordinator = new SerialQueue(),
    store?: CleanupStore,
  ) {
    this.store = store ?? new CleanupStore(root);
  }
  async inspect(): Promise<CleanupReport> {
    const inventory = await this.store.inventory();
    const baseline = await this.store.baseline();
    return this.coordinator.run(async () => {
      await this.checkBaseline(baseline);
      return reportFor(inventory, await this.candidates(inventory, baseline));
    });
  }
  async clean(input: unknown) {
    if (!Array.isArray(input) || !input.length || input.length > 200) {
      throw new Error('Select between 1 and 200 uploads');
    }
    const requested = input.map(parseCandidate);
    if (new Set(requested.map((item) => item.file)).size !== requested.length) {
      throw new Error('Duplicate cleanup selection');
    }
    const baseline = await this.store.baseline();
    return this.coordinator.run(async () => {
      await this.checkBaseline(baseline);
      const inventory = await this.store.inventory();
      const current = await this.candidates(inventory, baseline);
      const selected = requested.map((item) => {
        const candidate = current.find(
          (candidate) =>
            candidate.file === item.file &&
            candidate.version === item.version &&
            candidate.digest === item.digest &&
            candidate.kind === item.kind,
        );
        if (!candidate) {
          throw new Error('An upload or its references changed. Scan again before cleanup.');
        }
        return candidate;
      });
      const result = await this.remove(selected);
      const remaining = await this.store.inventory();
      return {
        ...result,
        report: reportFor(remaining, await this.candidates(remaining, baseline)),
      };
    });
  }
  async afterPublish(files: readonly RepositoryFile[], sha: string) {
    const published = new Map(
      files
        .filter((file) => file.path.startsWith('public/') && !file.deleted)
        .map((file) => [
          file.path,
          gitBlob(Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8')),
        ]),
    );
    return this.coordinator.run(async () => {
      await this.store.rememberPublished(sha, published);
      const inventory = await this.store.inventory();
      const candidates = await this.candidates(inventory, { sha, assets: published }, true);
      return this.remove(candidates);
    });
  }
  private async candidates(
    inventory: StorageInventory,
    baseline: AssetBaseline,
    publishedOnly = false,
  ) {
    const uploads = inventory.entries.filter((entry) =>
      /^assets\/public\/[\w -]+\.(png|jpe?g|gif|webp|avif|mp4|pdf)$/i.test(entry.key),
    );
    if (uploads.length > 1000) {
      throw new Error('Upload inventory exceeds cleanup limit');
    }
    const references = publishedOnly
      ? new Set<string>()
      : await referencedAssets(
          this.root,
          uploads.map((entry) => entry.key.slice(7)),
        );
    const candidates: CleanupCandidate[] = [];
    let total = 0;
    for (const entry of uploads) {
      const file = assetPath(entry.key.slice(7));
      const filename = await safePath(this.root, file);
      const info = await stat(filename);
      total += info.size;
      if (info.size > 20_000_000 || total > 100_000_000) {
        throw new Error('Upload scan exceeds memory limit');
      }
      const bytes = await readFile(filename);
      if (bytes.length !== entry.size) {
        continue;
      }
      const published = baseline.assets.get(file);
      const kind =
        published === gitBlob(bytes)
          ? 'published'
          : !published && !references.has(file)
            ? 'unreferenced'
            : undefined;
      if (kind && (!publishedOnly || kind === 'published')) {
        candidates.push({
          file,
          size: entry.size,
          version: entry.version,
          digest: assetDigest(bytes),
          kind,
        });
      }
    }
    return candidates;
  }
  private async remove(candidates: readonly CleanupCandidate[]) {
    let removed = 0;
    let freedBytes = 0;
    for (const candidate of candidates) {
      try {
        if (await this.store.remove(candidate)) {
          removed++;
          freedBytes += candidate.size;
        }
        // Published copies stay in the project and return from GitHub on restart.
        if (candidate.kind === 'unreferenced') {
          await rm(await safePath(this.root, candidate.file));
        }
      } catch (error) {
        return {
          removed,
          freedBytes,
          warning: error instanceof Error ? error.message : 'Cleanup stopped; scan again',
        };
      }
    }
    return { removed, freedBytes };
  }
  private async checkBaseline(baseline: AssetBaseline) {
    if (!baseline.sha) {
      return;
    }
    const current = string(
      record(
        JSON.parse(await readFile(path.join(this.root, '.studio-state/github-base.json'), 'utf8')),
      )['sha'],
      40,
    );
    if (baseline.sha !== current) {
      throw new Error('Published revision changed. Sync and scan again.');
    }
  }
}
function reportFor(
  inventory: StorageInventory,
  candidates: readonly CleanupCandidate[],
): CleanupReport {
  const sum = (prefix: string) =>
    inventory.entries
      .filter((entry) => entry.key.startsWith(prefix))
      .reduce((total, entry) => total + entry.size, 0);
  const totalBytes = sum('');
  const assetBytes = sum('assets/');
  const draftBytes = sum('documents/');
  return {
    location: inventory.location,
    totalBytes,
    assetBytes,
    draftBytes,
    otherBytes: totalBytes - assetBytes - draftBytes,
    count: inventory.entries.length,
    candidates,
  };
}
