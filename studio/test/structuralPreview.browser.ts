import { applyEdits, structuralEdits, flatten, nodesOf } from '../src/features/source/source';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { record, string } from '../src/shared/validation';

const url = process.env['STUDIO_URL'] ?? 'http://127.0.0.1:4360/studio';
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
const endpoint = new URL('/studio/api/file?file=src/pages/index.astro', url).href;
const headingText = process.env['STUDIO_TEST_HEADING'] ?? 'Style Guide';
let original: string | undefined;
let changed: string | undefined;
let afterDelete: string | undefined;
let started = 0;
const timings: { event: string; ms: number }[] = [];
page.on('websocket', (socket) =>
  socket.on('framereceived', (frame) => {
    const message = String(frame.payload);
    if (
      started &&
      (message.includes('"type":"update"') ||
        message.includes('"event":"studio:render"') ||
        message.includes('"event":"avb:page-changed"'))
    ) {
      timings.push({
        event: message.includes('"type":"update"')
          ? 'source'
          : message.includes('studio:render')
            ? 'render'
            : 'invalidation',
        ms: Math.round(performance.now() - started),
      });
    }
  }),
);
try {
  await page.goto(url);
  await page.locator('.save-state').filter({ hasText: 'Saved' }).waitFor();
  const canvas = page.frameLocator('iframe[title="Site preview"]');
  const heading = canvas.getByRole('heading', {
    name: headingText,
    exact: true,
  });
  await heading.waitFor();
  original = await readSource();
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await heading.click();
  await page
    .locator('.structure-node.selected')
    .filter({ has: page.locator('.label', { hasText: /^Heading$/ }) })
    .waitFor();
  started = performance.now();
  await page.locator('.structure-node.selected').click();
  await page.keyboard.press('Meta+d');
  try {
    await heading.nth(1).waitFor();
  } catch (error) {
    console.log(
      JSON.stringify({
        timings,
        toast: await page.locator('.studio-toast').allTextContents(),
        unchanged: (await readSource()) === original,
      }),
    );
    throw error;
  }
  const duplicate = Math.round(performance.now() - started);
  changed = await readSource();
  const duplicateNode = flatten(nodesOf(changed)).filter(
    (node) =>
      node.name === 'Heading' && node.children?.some((child) => child.value === headingText),
  )[1]?.id;
  assert.ok(duplicateNode);
  afterDelete = applyEdits(
    changed,
    structuralEdits(changed, { kind: 'delete', node: duplicateNode }, 'src/pages/index.astro'),
  );
  started = performance.now();
  await page.keyboard.press('Backspace');
  await heading.nth(1).waitFor({ state: 'detached' });
  const deleted = Math.round(performance.now() - started);
  assert.equal(await readSource(), afterDelete);
  console.log(JSON.stringify({ duplicate, deleted, timings }));
} finally {
  const base = await readSource();
  if (original && changed && (base === changed || base === afterDelete)) {
    const response = await page.request.post(new URL('/studio/api/source', url).href, {
      headers: { Origin: new URL(url).origin },
      data: { file: 'src/pages/index.astro', source: original, base },
    });
    assert.ok(response.ok());
  }
  await browser.close();
}
async function readSource() {
  return string(record(await (await page.request.get(endpoint)).json())['source']);
}
