import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sharedPublishingFixture } from './sharedPublishingFixture';

const fixture = await sharedPublishingFixture();
const browser = await chromium.launch({
  executablePath:
    process.env['CHROME_PATH'] ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const first = await browser.newPage();
  const second = await browser.newPage();
  const pages = [first, second];
  await first.goto(fixture.url);
  await second.goto(fixture.url + '?file=src/pages/other.astro');
  for (const page of pages) {
    await page.getByTestId('ready').filter({ hasText: 'Ready' }).waitFor();
  }
  fixture.update({
    sha: 'b'.repeat(40),
    files: [
      { file: 'src/pages/index.astro', before: '<h1>Original</h1>', after: '<h1>From GitHub</h1>' },
    ],
  });
  await first.getByTestId('source').filter({ hasText: 'From GitHub' }).waitFor();
  for (const page of pages) {
    await page.getByTestId('revision').filter({ hasText: '1' }).waitFor();
  }
  await writeFile(
    path.join(fixture.root, 'src/pages/broken.astro'),
    '---\nconst = ;\n---\n<h1>Broken</h1>',
  );
  await first.getByRole('button', { name: 'Publish', exact: true }).click();
  for (const page of pages) {
    await page.getByText('Building website', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Publishing…', exact: true }).isDisabled(),
      true,
    );
  }
  await second.reload();
  await second.getByText('Building website', { exact: true }).waitFor();
  assert.equal(
    await second.getByRole('button', { name: 'Publishing…', exact: true }).isDisabled(),
    true,
  );
  const checks = fixture.checks();
  await new Promise((resolve) => setTimeout(resolve, 250));
  assert.equal(fixture.checks(), checks, 'Automatic sync pauses during a publish');
  fixture.release();
  for (const page of pages) {
    await page.getByText('Publish needs attention', { exact: true }).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Publish', exact: true }).isEnabled(),
      true,
    );
  }
  assert.equal(fixture.publisher.state.kind, 'failed');
  console.log(
    'Real WebSocket sharing across pages and reconnects, automatic GitHub source refresh, and real Astro build-failure recovery passed.',
  );
} catch (error) {
  console.error(fixture.publisher.state);
  for (const context of browser.contexts()) {
    for (const page of context.pages()) {
      console.error(await page.locator('body').innerText());
    }
  }
  throw error;
} finally {
  await browser.close();
  await fixture.close();
}
