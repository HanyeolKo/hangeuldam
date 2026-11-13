import { test, expect, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
const qa = process.env.QA_OUTPUT_DIR || fileURLToPath(new URL('../.test-data/results/', import.meta.url));
async function open(page, name) {
  await page.locator('#file-input').setInputFiles(path.join(fixtures, name));
  await expect(page.locator('#doc-name')).toHaveText(name);
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await expect(page.locator('#error-banner')).toBeHidden();
}

test('example HWP, Korean text, zoom, original byte download', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await page.screenshot({ path: path.join(qa, 'empty.png') });
  await page.locator('#sample-button').click();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await expect(page.locator('#page-host svg text').first()).toHaveText('한');
  await page.screenshot({ path: path.join(qa, 'sample.png') });
  const initial = await page.locator('#zoom-value').textContent();
  await page.locator('#zoom-out').click();
  await expect(page.locator('#zoom-value')).not.toHaveText(initial);
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('한글담 — 내 문서를, 어디서나.');
  await expect(page.locator('#document-text')).toContainText('브라우저 데이터를 삭제하면');
  const downloading = page.waitForEvent('download');
  await page.locator('#download-original').click();
  const download = await downloading;
  expect(await readFile(await download.path())).toEqual(await readFile(new URL('../public/sample.hwp', import.meta.url)));
  expect(errors).toEqual([]);
});

test('independent multi-page HWP: navigation and text', async ({ page }) => {
  await page.goto('./');
  await open(page, 'multipage.hwp');
  await expect(page.locator('#page-total')).toHaveText('2');
  await page.locator('#next-page').click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await expect(page.locator('#next-page')).toBeDisabled();
  await page.locator('#prev-page').click();
  await expect(page.locator('#page-input')).toHaveValue('1');
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('가나다');
  await expect(page.locator('#document-text')).toContainText('new page');
});

test('independent HWP images and HWPX table', async ({ page }) => {
  await page.goto('./');
  await open(page, 'pictures-and-tables.hwp');
  await expect(page.locator('#page-total')).toHaveText('11');
  expect(await page.locator('#page-host svg image').count()).toBeGreaterThan(0);
  expect(await page.locator('#page-host svg image').first().getAttribute('href') || await page.locator('#page-host svg image').first().getAttribute('xlink:href')).toMatch(/^data:image\//);
  await page.screenshot({ path: path.join(qa, 'pictures.png') });
  await open(page, 'table.hwpx');
  expect(await page.locator('#page-host svg path, #page-host svg line, #page-host svg rect').count()).toBeGreaterThan(5);
  await page.screenshot({ path: path.join(qa, 'table.png') });
  await page.locator('#toggle-text').click();
  expect((await page.locator('#document-text').textContent()).length).toBeGreaterThan(10);
});

test('offline cold reload, saved file, and a newly opened HWPX without requests outside app', async ({ page, context }) => {
  const external = [], writes = [], errors = [];
  const origin = new URL(test.info().project.use.baseURL).origin;
  context.on('request', req => {
    if (/^https?:/.test(req.url()) && !req.url().startsWith(origin + '/')) external.push(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) writes.push(req.method());
  });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('./');
  await open(page, 'multipage.hwp');
  await page.locator('#save-local').click();
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  await page.locator('#offline-button').click();
  await expect(page.locator('#offline-status')).toContainText('오프라인 준비 완료', { timeout: 60000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#offline-status')).toContainText('오프라인 사용 중');
  await page.locator('#offline-button').click();
  await expect(page.locator('#offline-status')).toContainText('오프라인 사용 중');
  await page.locator('#saved-list .saved-open').click();
  await expect(page.locator('#doc-name')).toHaveText('multipage.hwp');
  await expect(page.locator('#page-host svg')).toBeVisible();
  await open(page, 'basic.hwpx');
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('수학');
  await page.screenshot({ path: path.join(qa, 'offline.png') });
  expect(external).toEqual([]); expect(writes).toEqual([]); expect(errors).toEqual([]);
});

test('invalid files fail clearly and a subsequent valid document opens', async ({ page }) => {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles({ name: 'broken.hwp', mimeType: 'application/octet-stream', buffer: Buffer.from('not a document') });
  await expect(page.locator('#error-banner')).toBeVisible();
  await expect(page.locator('#error-message')).toContainText('HWP 5 또는 HWPX');
  await page.locator('#file-input').setInputFiles({ name: 'truncated.hwp', mimeType: 'application/octet-stream', buffer: Buffer.from([208,207,17,224,161,177,26,225]) });
  await expect(page.locator('#error-message')).toContainText('문서를 열지 못했습니다');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await open(page, 'basic.hwpx');
});

test.describe('mobile device', () => {
  const { defaultBrowserType, ...phoneOptions } = devices['iPhone 13'];
  test.use(phoneOptions);
test('delete saved copy without altering original on a mobile browser', async ({ page }) => {
  await page.goto('./');
  await page.screenshot({ path: path.join(qa, 'mobile-empty.png'), fullPage: true });
  await open(page, 'basic.hwpx');
  await page.locator('#save-local').click();
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: path.join(qa, 'mobile-document.png'), fullPage: true });
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#device-library').click();
  await page.locator('#saved-list .saved-remove').click();
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(0);
  await page.locator('#device-library-close').click();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await expect(page.locator('#save-local')).toHaveText('기기에 저장');
});
});

test('cancel during font loading cannot replace a newer document', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => {
    const original = document.fonts.load.bind(document.fonts);
    let calls = 0;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    window.releaseOldFonts = release;
    document.fonts.load = async (...args) => { if (++calls <= 4) await gate; return original(...args); };
  });
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'multipage.hwp'));
  await expect(page.locator('#busy-overlay')).toBeVisible();
  await page.locator('#cancel-load').click();
  await open(page, 'basic.hwpx');
  await page.evaluate(() => window.releaseOldFonts());
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('수학');
  await expect(page.locator('#doc-name')).toHaveText('basic.hwpx');
});
