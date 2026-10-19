import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { record } from '../src/shared/validation';
import { parseReport } from '../src/features/storage/cleanupTypes';
const browser = await chromium.launch({
  executablePath:
    process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  ...(process.env['STUDIO_STORAGE_STATE']
    ? { storageState: process.env['STUDIO_STORAGE_STATE'] }
    : {}),
});
const page = await context.newPage();
const name = `studio-cleanup-test-${Date.now()}.png`;
const file = 'public/' + name;
let uploaded = false;
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(process.env['STUDIO_URL'] ?? 'http://localhost:4351/studio');
  await page.locator('.save-state').filter({ hasText: 'Saved' }).waitFor({ timeout: 90000 });
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page
    .locator('.asset-folder')
    .filter({ hasText: /^public$/ })
    .click();
  const upload = page.waitForResponse((response) => response.url().includes('/studio/api/upload?'));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload assets', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  assert.equal((await upload).status(), 201);
  uploaded = true;
  await page.locator('.asset-name').filter({ hasText: name }).waitFor();
  await page.getByLabel('Stacki account menu', { exact: true }).click();
  await page.getByRole('button', { name: 'Storage & cleanup', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Clean ' + file, exact: true }).check();
  await page.getByRole('button', { name: 'Review cleanup (1)', exact: true }).click();
  await page.getByText(/This permanently deletes 1 unpublished upload/).waitFor();
  await page.screenshot({ path: 'test-results/storage-cleanup.png' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(
    (
      await page.request.get(
        new URL('/studio/api/asset?file=' + encodeURIComponent(file), page.url()).href,
      )
    ).status(),
    200,
  );
  await page.getByRole('button', { name: 'Review cleanup (1)', exact: true }).click();
  const cleaned = page.waitForResponse((response) =>
    response.url().endsWith('/studio/api/storage/cleanup'),
  );
  await page.getByRole('button', { name: 'Confirm cleanup', exact: true }).click();
  const response = await cleaned;
  assert.equal(response.status(), 200);
  const result = record(await response.json());
  assert.equal(result['removed'], 1);
  assert.ok(!result['warning']);
  const report = parseReport(result['report']);
  assert.ok(report.draftBytes > 0);
  await page.locator('.asset-name').filter({ hasText: name }).waitFor({ state: 'detached' });
  uploaded = false;
  assert.deepEqual(errors, []);
  console.log(
    `Upload, actual ${report.location} storage inspection, cancel, confirmed cleanup, and retained drafts passed.`,
  );
} finally {
  // Remove only this test's upload through the same checked cleanup endpoint.
  if (uploaded) {
    const response = await page.request.get(new URL('/studio/api/storage', page.url()).href);
    if (response.ok()) {
      const report = parseReport(await response.json());
      const candidates = report.candidates.filter((candidate) => candidate.file === file);
      if (candidates.length) {
        await page.evaluate(async (candidates) => {
          await fetch('/studio/api/storage/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ candidates }),
          });
        }, candidates);
      }
    }
  }
  await browser.close();
}
