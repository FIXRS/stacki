// Astro stats directory entries before ignoring dotfiles. Keep short-lived save
// files inside a stable hidden directory so route scans cannot race their removal.
import fs from 'node:fs';
import path from 'node:path';
import { err, ok, type Result } from '../../shared/core/result';

export const ATOMIC_DIRECTORY = '.stacki-io';

interface AtomicDirectoryError {
  readonly code: 'filesystem';
  readonly message: string;
}

export function atomicDirectoryOf(file: string): string {
  return path.join(path.dirname(file), ATOMIC_DIRECTORY);
}

/** The directory stays in place between saves; removing it recreates the scan race. */
export function prepareAtomicDirectory(file: string): Result<string, AtomicDirectoryError> {
  const directory = atomicDirectoryOf(file);
  try {
    fs.mkdirSync(directory);
  } catch (error: unknown) {
    if (!prepareAtomicDirectoryExists(error)) {
      return prepareAtomicDirectoryFailure(directory, error);
    }
  }
  try {
    const metadata = fs.lstatSync(directory);
    if (!metadata.isDirectory()) {
      return prepareAtomicDirectoryFailure(directory, 'Expected a directory, not a file or link');
    }
    // A mounted directory would turn the rename into a cross-filesystem move.
    if (metadata.dev !== fs.statSync(path.dirname(file)).dev) {
      return prepareAtomicDirectoryFailure(directory, 'Must be on the target filesystem');
    }
  } catch (error: unknown) {
    return prepareAtomicDirectoryFailure(directory, error);
  }
  return ok(directory);
}

function prepareAtomicDirectoryExists(error: unknown): boolean {
  if (error instanceof Error) {
    if ('code' in error) {
      return error.code === 'EEXIST';
    }
  }
  return false;
}

function prepareAtomicDirectoryFailure(
  directory: string,
  error: unknown,
): Result<never, AtomicDirectoryError> {
  const message = error instanceof Error ? error.message : String(error);
  return err({ code: 'filesystem', message: `Could not prepare ${directory}: ${message}` });
}
