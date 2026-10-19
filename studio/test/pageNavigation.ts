import type { Page } from 'playwright';

export async function switchPage(page: Page, file: string) {
  await page.getByLabel('Current page', { exact: true }).click();
  await page.getByLabel('Search pages', { exact: true }).fill(file.replace(/^src\/pages\//, ''));
  await page
    .locator('.page-menu-item')
    .filter({
      hasText:
        file
          .split('/')
          .at(-1)
          ?.replace(/\.astro$/, '') ?? '',
    })
    .click();
}
