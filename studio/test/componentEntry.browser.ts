import { chromium, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { record, string } from '../src/shared/validation';

const browser = await chromium.launch({
  executablePath:
    process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const auth = process.env['STUDIO_STORAGE_STATE'];
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  ...(auth ? { storageState: auth } : {}),
});
page.setDefaultTimeout(20000);
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env['STUDIO_URL'] ?? 'http://localhost:4352/studio');
  await saved(page);
  const originalPage = await readSource(page, 'src/pages/index.astro');
  const originalComponent = await readSource(page, 'src/components/typography/Heading.astro');
  const frameElement = await page.locator('iframe[title="Site preview"]').elementHandle();
  assert.ok(frameElement);
  const preview = page.frameLocator('iframe[title="Site preview"]');
  await preview.locator('h1').waitFor();
  let navigations = 0;
  page.on('framenavigated', () => navigations++);
  const before = await preview.locator('h1').boundingBox();
  await preview.locator('h1').dblclick();
  await selectedHeading(page);
  assert.equal(navigations, 0);
  assert.ok(
    await frameElement.evaluate(
      (element) => element === document.querySelector('iframe[title="Site preview"]'),
    ),
  );
  assert.deepEqual(
    await preview.locator('h1').boundingBox(),
    before,
    'Component entry preserves the viewport',
  );
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.locator('.code-panel-path').filter({ hasText: 'Heading.astro' }).waitFor();
  await page.locator('.code-panel-lines').waitFor();
  await page.getByTitle('Back to page', { exact: true }).click();
  await saved(page);
  await page.locator('.code-panel-path').filter({ hasText: 'index.astro' }).waitFor();
  assert.equal(navigations, 0, 'Returning to the page keeps the preview mounted');
  await page.getByRole('button', { name: 'Navigator', exact: true }).click();
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await page
    .locator('.structure-node')
    .filter({ has: page.locator('.label', { hasText: /^Heading$/ }) })
    .dblclick();
  await selectedHeading(page);
  assert.equal(navigations, 0, 'Navigator entry keeps the same preview');
  await page.getByTitle('Back to page', { exact: true }).click();
  await saved(page);
  await page.getByRole('button', { name: 'Current page', exact: true }).click();
  await page.getByRole('option').filter({ hasText: 'example-components' }).click();
  await saved(page);
  const headings = preview.locator('h2.heading');
  await headings.nth(1).scrollIntoViewIfNeeded();
  const afterPageChange = navigations;
  await headings.nth(1).dblclick();
  await selectedHeading(page);
  await assertOutlineOn(page, headings.nth(1));
  assert.equal(navigations, afterPageChange, 'Repeated component entry must not navigate');
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/component-entry.png' });
  assert.equal(await readSource(page, 'src/pages/index.astro'), originalPage);
  assert.equal(
    await readSource(page, 'src/components/typography/Heading.astro'),
    originalComponent,
  );
  assert.deepEqual(errors, []);
  console.log(
    'Component entry preserves the iframe and viewport, selects rendered markup, follows repeated instances and switches source correctly.',
  );
} finally {
  await browser.close();
}
async function saved(page: Page) {
  await page.locator('.save-state').filter({ hasText: 'Saved' }).waitFor();
}
async function selectedHeading(page: Page) {
  await page.locator('.comp-back').filter({ hasText: 'Heading.astro' }).waitFor();
  await saved(page);
  await page
    .locator('.structure-node.selected .label')
    .filter({ hasText: /^heading$/ })
    .waitFor();
}
async function readSource(page: Page, file: string) {
  const result = await page.request.get(
    new URL('/studio/api/file?file=' + encodeURIComponent(file), page.url()).href,
  );
  return string(record(await result.json())['source']);
}
async function assertOutlineOn(page: Page, heading: ReturnType<Page['locator']>) {
  const outline = page.locator('.node-outline.sel').first();
  await outline.waitFor();
  const expected = await heading.boundingBox();
  const actual = await outline.boundingBox();
  assert.ok(expected && actual);
  assert.ok(
    Math.abs(actual.x - expected.x) < 3 && Math.abs(actual.y - expected.y) < 3,
    `Outline must stay on the opened instance: ${JSON.stringify({ expected, actual })}`,
  );
}
