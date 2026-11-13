import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
const qa = process.env.QA_OUTPUT_DIR || fileURLToPath(new URL('../.test-data/results/', import.meta.url));
const violationsByContext = new WeakMap();

test.beforeAll(async () => {
  globalThis.measureTextWidth = (_font, text) => [...text].reduce((width, char) => width + (char.codePointAt(0) > 255 ? 12 : 6), 0);
  await init({ module_or_path: await readFile(new URL('../public/vendor/rhwp_bg.wasm', import.meta.url)) });
  await mkdir(qa, { recursive: true });
});

test.beforeEach(async ({ context, baseURL }) => {
  const violations = [];
  violationsByContext.set(context, violations);
  const origin = new URL(baseURL).origin;
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || request.method() !== 'GET' || request.postDataBuffer()?.length) {
      violations.push({ url: request.url(), method: request.method() });
      return route.abort('blockedbyclient');
    }
    await route.continue();
  });
});
test.afterEach(async ({ context }) => { expect(violationsByContext.get(context)).toEqual([]); });

async function open(page) {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'multipage.hwp'));
  await expect(page.locator('#doc-name')).toHaveText('multipage.hwp');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
}

async function fullscreen(page, active) {
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id || null)).toBe(active ? 'drop-zone' : null);
  await expect(page.locator('#toggle-fullscreen')).toHaveAttribute('aria-pressed', String(active));
  await expect(page.locator('#toggle-fullscreen')).toHaveAttribute('aria-label', active ? '전체화면 나가기' : '전체화면');
}

async function toolsFit(page) {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  for (const id of ['doc-name', 'toggle-fullscreen', 'edit-document', 'download-hwp', 'save-local', 'close-document']) {
    const box = await page.locator(`#${id}`).boundingBox();
    expect(box, `${id} must be visible`).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
  }
}

for (const viewport of [{ width: 1440, height: 1000 }, { width: 480, height: 640 }]) {
  test(`reader fullscreen keeps tools visible and exits on Escape and close at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await open(page);
    await page.locator('#toggle-fullscreen').click();
    await fullscreen(page, true);
    await toolsFit(page);
    const layout = await page.evaluate(() => {
      const root = document.fullscreenElement;
      const rect = root.getBoundingClientRect();
      return { width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
        hasSidebar: root.contains(document.querySelector('.sidebar')), hasAppbar: root.contains(document.querySelector('.appbar')) };
    });
    expect(layout.width).toBe(layout.viewportWidth);
    expect(layout.height).toBe(layout.viewportHeight);
    expect(layout.hasSidebar).toBe(false);
    expect(layout.hasAppbar).toBe(false);
    await page.locator('#next-page').click();
    await expect(page.locator('#page-input')).toHaveValue('2');
    await expect(page.locator('#busy-overlay')).toBeHidden();
    await page.screenshot({ path: path.join(qa, `fullscreen-reader-${viewport.width}.png`) });
    await page.keyboard.press('Escape');
    await fullscreen(page, false);
    await expect(page.locator('#page-input')).toHaveValue('2');
    await page.locator('#toggle-fullscreen').click();
    await fullscreen(page, true);
    await page.locator('#close-document').click();
    await fullscreen(page, false);
    await expect(page.locator('#empty-state')).toBeVisible();
  });
}

test('fullscreen preserves the editor, edits, read view, HWP save and iframe Escape', async ({ page }) => {
  await open(page);
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await page.locator('#editor-host iframe').evaluate(frame => { frame.dataset.fullscreenTest = 'same-editor'; });
  await page.locator('#toggle-fullscreen').click();
  await fullscreen(page, true);
  await toolsFit(page);
  const frame = page.frameLocator('#editor-host iframe');
  const input = frame.locator('textarea[aria-label="문서 편집 입력"]');
  await input.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText('전체화면편집검증 ');
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  await page.screenshot({ path: path.join(qa, 'fullscreen-editor.png') });
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'false');
  await fullscreen(page, true);
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('전체화면편집검증 가나다');
  await page.locator('#toggle-text').click();
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#editor-host iframe')).toHaveAttribute('data-fullscreen-test', 'same-editor');
  const downloading = page.waitForEvent('download');
  await page.locator('#download-hwp').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('multipage.hwp');
  const doc = new HwpDocument(new Uint8Array(await readFile(await download.path())));
  try { expect(JSON.parse(doc.getTextFileUnicode())).toContain('전체화면편집검증 가나다'); }
  finally { doc.free(); }
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
  await fullscreen(page, true);
  await input.focus();
  await page.keyboard.press('Escape');
  await fullscreen(page, false);
  await expect(page.locator('#editor-host iframe')).toHaveAttribute('data-fullscreen-test', 'same-editor');
});

test('unsupported native fullscreen uses an app expansion and restores layout on toggle, Escape and close', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(document, 'fullscreenEnabled', { get: () => false }); });
  await page.setViewportSize({ width: 480, height: 640 });
  await open(page);
  await expect(page.locator('#toggle-fullscreen')).toBeEnabled();
  await expect(page.locator('#toggle-fullscreen')).toHaveAccessibleName('화면 확대');
  await expect(page.locator('#fullscreen-support')).toContainText('브라우저 상단은 유지');
  await page.locator('#toggle-fullscreen').click();
  await expect(page.locator('#drop-zone')).toHaveClass(/is-expanded/);
  await expect(page.locator('#toggle-fullscreen')).toHaveAccessibleName('화면 확대 종료');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe('hidden');
  await toolsFit(page);
  const bounds = await page.locator('#drop-zone').boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, width: 480, height: 640 });
  await page.locator('#next-page').click();
  await expect(page.locator('#page-input')).toHaveValue('2');
  await page.locator('#toggle-fullscreen').click();
  await expect(page.locator('#drop-zone')).not.toHaveClass(/is-expanded/);
  await page.locator('#toggle-fullscreen').click();
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#drop-zone')).toHaveClass(/is-expanded/);
  await page.frameLocator('#editor-host iframe').locator('textarea[aria-label="문서 편집 입력"]').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('#drop-zone')).not.toHaveClass(/is-expanded/);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
  await expect(page.locator('#editor-host iframe')).toHaveCount(1);
  await page.locator('#toggle-fullscreen').click();
  await page.locator('#close-document').click();
  await expect(page.locator('#drop-zone')).not.toHaveClass(/is-expanded/);
  await expect(page.locator('#empty-state')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).not.toBe('hidden');
});

test('a rejected fullscreen request keeps the document and permits retry', async ({ page }) => {
  await page.addInitScript(() => {
    window.__nativeFullscreen = Element.prototype.requestFullscreen;
    Element.prototype.requestFullscreen = async () => { throw new Error('Injected fullscreen rejection'); };
  });
  await open(page);
  await page.locator('#toggle-fullscreen').click();
  await fullscreen(page, false);
  await expect(page.locator('#error-message')).toContainText('전체화면으로 전환하지 못했습니다');
  await expect(page.locator('#toggle-fullscreen')).toBeEnabled();
  await expect(page.locator('#doc-name')).toHaveText('multipage.hwp');
  await page.evaluate(() => { Element.prototype.requestFullscreen = window.__nativeFullscreen; });
  await page.locator('#dismiss-error').click();
  await page.locator('#toggle-fullscreen').click();
  await fullscreen(page, true);
  await page.locator('#toggle-fullscreen').click();
  await fullscreen(page, false);
});
