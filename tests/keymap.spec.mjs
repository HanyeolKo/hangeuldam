import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import init, { HwpDocument } from '@rhwp/core';

const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
test.beforeAll(async () => {
  globalThis.measureTextWidth = (_font, text) => [...text].reduce((width, char) => width + (char.codePointAt(0) > 255 ? 12 : 6), 0);
  await init({ module_or_path: await readFile(new URL('../public/vendor/rhwp_bg.wasm', import.meta.url)) });
});
async function open(page) {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'multipage.hwp'));
  await expect(page.locator('#page-host svg')).toBeVisible();
  await expect(page.locator('#busy-overlay')).toBeHidden();
}
async function download(page, action) {
  const waiting = page.waitForEvent('download');
  await action();
  const file = await waiting;
  const doc = new HwpDocument(new Uint8Array(await readFile(await file.path())));
  try {
    return { text: JSON.parse(doc.getTextFileUnicode()), runs: JSON.parse(doc.getPageTextLayout(0)).runs };
  } finally { doc.free(); }
}

test('keymap: reader commands navigate, zoom, change mode and respect ordinary inputs', async ({ page }) => {
  await open(page);
  await page.locator('body').click({ position: { x: 300, y: 20 } });
  await page.keyboard.press('Control+End');
  await expect(page.locator('#page-input')).toHaveValue('2');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await page.keyboard.press('Control+Home');
  await expect(page.locator('#page-input')).toHaveValue('1');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await page.keyboard.press('Control+0');
  await expect(page.locator('#zoom-value')).toHaveText('100%');
  await page.keyboard.press('Control+Equal');
  await expect(page.locator('#zoom-value')).toHaveText('110%');
  await page.keyboard.press('Control+Minus');
  await expect(page.locator('#zoom-value')).toHaveText('100%');
  await page.locator('#page-input').focus();
  await page.keyboard.press('PageDown');
  await expect(page.locator('#page-input')).toHaveValue('1');
  await page.locator('body').click({ position: { x: 300, y: 20 } });
  await page.keyboard.press('Alt+Shift+t');
  await expect(page.locator('#document-text')).toContainText('가나다');
  await page.keyboard.press('F1');
  await expect(page.locator('#shortcuts-dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: '굵게 실행', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Shift+e');
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#busy-overlay')).toBeHidden();
  const missing = await page.evaluate(async () => {
    const { KEYMAP } = await import('./KEYMAP.js');
    const known = new Set(document.querySelector('#editor-host iframe').contentWindow.rhwpStudio.automation.listCommands().map(entry => entry.id));
    return KEYMAP.filter(entry => entry.command && !known.has(entry.command)).map(entry => entry.command);
  });
  expect(missing).toEqual([]);
});

for (const device of ['phone', 'tablet']) {
  test(`keymap: ${device} uses common keys, visible help and touch formatting without duplicate commands`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, userAgent: device === 'phone'
      ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
      viewport: device === 'phone' ? { width: 390, height: 844 } : { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    try {
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('data-device', device);
      await page.keyboard.press('Control+Shift+e');
      await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
      await expect(page.locator('#busy-overlay')).toBeHidden();
      const frame = page.frameLocator('#editor-host iframe');
      const input = frame.locator('textarea[aria-label="문서 편집 입력"]');
      await input.focus();
      await page.keyboard.press('Control+Home');
      const marker = '공통서식';
      await page.keyboard.insertText(marker);
      for (let index = 0; index < marker.length; index++) await page.keyboard.press('Shift+ArrowLeft');
      await page.keyboard.press('Control+b');
      await page.keyboard.press('Meta+i');
      await page.keyboard.press('F1');
      await expect(page.locator('#shortcuts-dialog')).toBeVisible();
      const mappedCount = await page.evaluate(async () => (await import('./KEYMAP.js')).KEYMAP.length);
      await expect(page.locator('.shortcuts-list [data-command]')).toHaveCount(mappedCount);
      await expect(page.locator('.shortcuts-list [data-command="file.download"] kbd').first()).toBeVisible();
      await page.getByRole('button', { name: '밑줄 실행', exact: true }).tap();
      await expect(page.locator('#shortcuts-dialog')).toBeHidden();
      const saved = await download(page, () => page.keyboard.press('Control+Shift+s'));
      expect(saved.text).toContain('공통서식가나다');
      expect(saved.runs.filter(run => run.bold && run.italic).map(run => run.text).join('')).toContain(marker);
      await expect(input).toBeFocused();
      await page.keyboard.press('Control+s');
      await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
      await expect(page.locator('#busy-overlay')).toBeHidden();
      await expect(input).toBeFocused();
      await page.keyboard.press('Control+f');
      await expect(frame.locator('.find-dialog')).toBeVisible();
      await frame.locator('.find-dialog-input').first().fill(marker);
      await page.keyboard.press('Escape');
      await expect(frame.locator('.find-dialog')).toHaveCount(0);
      await expect(page.locator('#error-banner')).toBeHidden();
    } finally { await context.close(); }
  });
}
