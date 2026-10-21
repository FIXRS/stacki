// Reuse the scan's bounded source reads so titles require no additional disk access.
import { parsePage } from '../parse/astroParser';
import { layoutPageTitle } from '../../shared/page/pageTitle';
import type { ScanPage } from '../../shared/properties/projectScan';

export function scanPageTitles(
  pages: readonly ScanPage[],
  sources: readonly { readonly file: string; readonly text: string }[],
): readonly ScanPage[] {
  const sourceByPath = new Map(sources.map(({ file, text }) => [file, text]));
  return pages.map((page) => {
    if (!page.path.toLowerCase().endsWith('.astro')) {
      return page;
    }
    const source = sourceByPath.get(page.path);
    if (source === undefined) {
      return page;
    }
    const parsed = parsePage(source);
    const title = parsed.editable ? layoutPageTitle(parsed.model.nodes) : undefined;
    return title === undefined ? page : { ...page, title };
  });
}
