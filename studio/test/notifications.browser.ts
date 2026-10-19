import { chromium, type Page } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const browser = await chromium.launch({
  executablePath:
    process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const url = process.env['STUDIO_URL'] ?? 'http://localhost:4350/studio';
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
let result: object = { kind: 'failed', message: 'Sync regression: GitHub unavailable.' };
await page.route('**/studio/api/sync', (route) => route.fulfill({ json: result }));
try {
  await page.clock.install();
  await page.goto(url);
  await page.locator('.save-state').filter({ hasText: 'Saved' }).waitFor();
  const toast = page.locator('.studio-toast');
  await toast.filter({ hasText: 'GitHub unavailable' }).waitFor();
  assert.equal(await page.locator('.sync-notice').count(), 0);
  await bottomToast(page);
  await poll(page);
  assert.equal(await toast.count(), 1, 'Repeated failures must not stack duplicate toasts');
  result = { kind: 'synced', sha: 'b'.repeat(40) };
  const refreshed = page.waitForResponse('**/studio/api/project');
  await poll(page);
  await refreshed;
  assert.match(await toast.innerText(), /GitHub unavailable/, 'Refresh must not dismiss errors');
  result = { kind: 'failed', message: 'Sync regression: another failure.' };
  await poll(page);
  assert.match(await toast.innerText(), /GitHub unavailable/, 'New errors must queue');
  await page.getByLabel('Dismiss notification').click();
  await toast.filter({ hasText: 'another failure' }).waitFor();
  await page.clock.runFor(250);
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: 'test-results/notifications-desktop.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await bottomToast(page);
  await page.screenshot({ path: 'test-results/notifications-mobile.png', animations: 'disabled' });
  await page.getByLabel('Dismiss notification').click();
  await page.clock.runFor(250);
  await toast.waitFor({ state: 'detached' });
  await poll(page);
  assert.equal(await toast.count(), 0, 'An unchanged dismissed failure must stay dismissed');
  result = { kind: 'synced', sha: 'b'.repeat(40) };
  await poll(page);
  result = { kind: 'failed', message: 'Sync regression: another failure.' };
  await poll(page);
  await toast.waitFor();
  await bootFailure();
  assert.deepEqual(errors, []);
  console.log(
    'Persistent bottom toasts, queued errors, poll deduplication, recovery, startup retry, and mobile layout passed.',
  );
} finally {
  await browser.close();
}

async function poll(page: Page) {
  const response = page.waitForResponse('**/studio/api/sync');
  await page.clock.fastForward(61_000);
  await (await response).finished();
  await page.waitForTimeout(100);
}

async function bottomToast(page: Page) {
  const box = await page.locator('.studio-toast').boundingBox();
  const viewport = page.viewportSize();
  assert.ok(box && viewport);
  assert.ok(box.y > viewport.height / 2);
  assert.ok(box.x >= 0 && box.x + box.width <= viewport.width);
  assert.ok(viewport.height - box.y - box.height < 50);
}

async function bootFailure() {
  const boot = await browser.newPage();
  await boot.route(
    '**/studio/api/project',
    async (route) => {
      await route.fulfill({ status: 500, json: { error: 'Startup regression failure.' } });
    },
    { times: 1 },
  );
  await boot.goto(url);
  await boot.locator('.studio-toast').filter({ hasText: 'Startup regression failure' }).waitFor();
  await boot.getByRole('button', { name: 'Retry', exact: true }).click();
  await boot.locator('.save-state').filter({ hasText: 'Saved' }).waitFor();
  assert.match(await boot.locator('.studio-toast').innerText(), /Startup regression failure/);
  await boot.getByLabel('Dismiss notification').click();
  await boot.locator('.studio-toast').waitFor({ state: 'detached' });
  await boot.close();
}
