import { readProjectMetadata } from './projectMetadata';
import { parsePublishSource } from '../../shared/properties/publishConfig';

export function readPublishConfig(root: string) {
  const metadata = readProjectMetadata(root, 'publish');
  if (!metadata.ok) {
    throw new Error(metadata.error.message);
  }
  return parsePublishSource(metadata.value.source);
}
