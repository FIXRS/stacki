// Check tracked editor metadata before CI or an external component refactor is considered done.
import { loadInsertionDefaults } from '../src/features/settings/loadDefaults';
import { readMetadataSource } from '../src/features/settings/projectMetadata';
import { defaultsIssues } from '../vendor/stacki/shared/properties/componentDefaults';
import { validateMetadata } from '../vendor/stacki/shared/properties/projectMetadata';

export async function checkProject(root: string): Promise<void> {
  const sources = await readMetadataSource(root, 'componentSources');
  if (sources.source !== undefined) {
    validateMetadata('componentSources', sources.source);
  }
  const settings = await loadInsertionDefaults(root);
  const issues = defaultsIssues(settings.config, settings.catalog);
  const guide = await readMetadataSource(root, 'guide');
  if (guide.source !== undefined) {
    validateMetadata('guide', guide.source);
  }
  const publishing = await readMetadataSource(root, 'publish');
  if (publishing.source !== undefined) {
    validateMetadata('publish', publishing.source);
  }
  const pages = await readMetadataSource(root, 'pages');
  if (pages.source !== undefined) {
    validateMetadata('pages', pages.source);
  }
  if (issues.length > 0) {
    throw new Error(issues.join('\n'));
  }
  console.log('Project component defaults, guide, page order, and publish settings are valid.');
}
