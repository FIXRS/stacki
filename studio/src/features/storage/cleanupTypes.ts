import { managedAsset } from '../assets/assetStateTypes';
import { record, string } from '../../shared/validation';
export interface StoredEntry {
  readonly key: string;
  readonly size: number;
  readonly version: string;
}
export interface StorageInventory {
  readonly location: 'r2' | 'local';
  readonly entries: readonly StoredEntry[];
}
export interface CleanupCandidate {
  readonly file: string;
  readonly size: number;
  readonly version: string;
  readonly digest: string;
  readonly kind: 'published' | 'unreferenced';
}
export interface CleanupReport {
  readonly location: 'r2' | 'local';
  readonly totalBytes: number;
  readonly assetBytes: number;
  readonly draftBytes: number;
  readonly otherBytes: number;
  readonly count: number;
  readonly candidates: readonly CleanupCandidate[];
}
export function assetPath(value: unknown) {
  return managedAsset(value);
}
export function parseEntries(value: unknown): StoredEntry[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    throw new Error('Invalid storage inventory');
  }
  return value.map((input) => {
    const item = record(input);
    return {
      key: string(item['key'], 1000),
      size: byteSize(item['size']),
      version: string(item['version'], 200),
    };
  });
}
export function byteSize(value: unknown) {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error('Invalid storage size');
  }
  return value;
}
export function parseCandidate(input: unknown): CleanupCandidate {
  const item = record(input);
  const kind = item['kind'];
  const digest = string(item['digest'], 64);
  if ((kind !== 'published' && kind !== 'unreferenced') || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('Invalid cleanup candidate');
  }
  return {
    file: assetPath(item['file']),
    size: byteSize(item['size']),
    version: string(item['version'], 200),
    digest,
    kind,
  };
}
export function parseReport(input: unknown): CleanupReport {
  const item = record(input);
  if (item['location'] !== 'r2' && item['location'] !== 'local') {
    throw new Error('Invalid storage location');
  }
  const candidates = item['candidates'];
  if (!Array.isArray(candidates) || candidates.length > 1000) {
    throw new Error('Invalid cleanup preview');
  }
  return {
    location: item['location'],
    totalBytes: byteSize(item['totalBytes']),
    assetBytes: byteSize(item['assetBytes']),
    draftBytes: byteSize(item['draftBytes']),
    otherBytes: byteSize(item['otherBytes']),
    count: byteSize(item['count']),
    candidates: candidates.map(parseCandidate),
  };
}
