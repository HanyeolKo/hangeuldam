import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
const qa = process.env.QA_OUTPUT_DIR || fileURLToPath(new URL('../.test-data/results/', import.meta.url));
const agents = {
  phone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  tablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};

test.beforeAll(async () => {
  await mkdir(qa, { recursive: true });
  globalThis.measureTextWidth = (_font, text) => [...text].reduce((n, c) => n + (c.codePointAt(0) > 255 ? 12 : 6), 0);
  await init({ module_or_path: await readFile(new URL('../public/vendor/rhwp_bg.wasm', import.meta.url)) });
});

function readText(bytes) {
  const document = new HwpDocument(new Uint8Array(bytes));
  try { return JSON.parse(document.getTextFileUnicode()); }
  finally { document.free(); }
}

async function touchContext(browser, baseURL, device, viewport) {
  return browser.newContext({ baseURL, userAgent: agents[device], viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
}

async function openSample(page) {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'multipage.hwp'));
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await expect(page.locator('#error-banner')).toBeHidden();
}

test('device category follows browser signals, including iPad desktop mode, rather than viewport size', async ({ page }) => {
  await page.goto('./');
  const results = await page.evaluate(async () => {
    const { detectDevice } = await import('./device.js');
    return [
      detectDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile', maxTouchPoints: 5 }),
      detectDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-X710)', maxTouchPoints: 5 }),
      detectDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 }),
      detectDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)', platform: 'MacIntel', maxTouchPoints: 5 }),
      detectDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', platform: 'Win32', maxTouchPoints: 10 }),
      detectDevice({ userAgent: 'Reduced UA', userAgentData: { mobile: true, platform: 'Android' } }),
    ];
  });
  expect(results).toEqual(['phone', 'tablet', 'phone', 'tablet', 'desktop', 'phone']);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).toHaveAttribute('data-device', 'desktop');
  await expect(page.locator('#device-library')).toBeHidden();
  await expect(page.locator('.sidebar')).toBeVisible();
});

for (const device of ['phone', 'tablet']) {
  test(`${device} browser has touch controls and edits, saves and reopens HWP locally`, async ({ browser, baseURL }) => {
    const context = await touchContext(browser, baseURL, device, device === 'phone' ? { width: 390, height: 844 } : { width: 820, height: 1180 });
    const page = await context.newPage();
    const external = [], writes = [];
    context.on('request', request => {
      if (new URL(request.url()).origin !== new URL(baseURL).origin) external.push(request.url());
      if (!['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
    });
    try {
      await openSample(page);
      await expect(page.locator('html')).toHaveAttribute('data-device', device);
      for (const id of ['edit-document', 'download-hwp', 'toggle-fullscreen']) {
        const bounds = await page.locator(`#${id}`).boundingBox();
        expect(bounds.height).toBeGreaterThanOrEqual(44);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize().width + 1);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: path.join(qa, `${device}-reader.png`) });
      await page.locator('#edit-document').tap();
      await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
      await expect(page.locator('#busy-overlay')).toBeHidden();
      const frame = page.frameLocator('#editor-host iframe');
      await expect(frame.locator('html')).toHaveAttribute('data-device', device);
      await expect(frame.locator('#hangeuldam-touch-tools')).toBeVisible();
      if (device === 'phone') {
        await expect(frame.locator('#style-bar')).toBeHidden();
        await frame.locator('#hangeuldam-format').tap();
        await expect(frame.locator('#style-bar')).toBeVisible();
        await frame.locator('#hangeuldam-format').tap();
        await expect(frame.locator('#style-bar')).toBeHidden();
        const initialZoom = await frame.locator('#sb-zoom-display').innerText();
        await frame.locator('#hangeuldam-zoom-in').tap();
        await expect(frame.locator('#sb-zoom-display')).not.toHaveText(initialZoom);
        await frame.locator('#hangeuldam-fit').tap();
      }
      const canvas = frame.locator('canvas.document-page-canvas').first();
      await expect(canvas).toBeVisible();
      await canvas.tap({ position: { x: 70, y: 70 } });
      await frame.locator('#hangeuldam-input').tap();
      await expect(frame.locator('textarea[aria-label="문서 편집 입력"]')).toBeFocused();
      const marker = `${device === 'phone' ? '모바일' : '태블릿'}편집확인 `;
      await page.keyboard.insertText(marker);
      await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
      await page.screenshot({ path: path.join(qa, `${device}-editor.png`) });
      const downloading = page.waitForEvent('download');
      await page.locator('#download-hwp').tap();
      const download = await downloading;
      expect(readText(await readFile(await download.path()))).toContain(marker);
      await expect(page.locator('#busy-overlay')).toBeHidden();
      await page.locator('#save-local').tap();
      await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
      await page.locator('#close-document').tap();
      await page.locator('#device-library').tap();
      await expect(page.locator('.sidebar')).toBeVisible();
      await page.locator('#saved-list .saved-open').tap();
      await expect(page.locator('.sidebar')).toBeHidden();
      await expect(page.locator('#page-host svg')).toBeVisible();
      await page.locator('#toggle-text').tap();
      await expect(page.locator('#document-text')).toContainText(marker);
      expect(external).toEqual([]);
      expect(writes).toEqual([]);
    } finally { await context.close(); }
  });
}

test('phone orientation keeps phone layout and explicit view preference can be changed', async ({ browser, baseURL }) => {
  const context = await touchContext(browser, baseURL, 'phone', { width: 390, height: 844 });
  const page = await context.newPage();
  try {
    await page.goto('./');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('html')).toHaveAttribute('data-device', 'phone');
    await page.locator('#device-library').tap();
    await page.locator('#device-view').selectOption('tablet');
    await expect(page.locator('html')).toHaveAttribute('data-device', 'tablet');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-device', 'tablet');
    await page.locator('#device-library').tap();
    await page.locator('#device-view').selectOption('auto');
    await expect(page.locator('html')).toHaveAttribute('data-device', 'phone');
  } finally { await context.close(); }
});

test('iPad desktop user agent remains tablet at different window sizes', async ({ browser, baseURL }) => {
  const context = await touchContext(browser, baseURL, 'ipadDesktop', { width: 1024, height: 1366 });
  await context.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  const page = await context.newPage();
  try {
    await page.goto('./');
    await expect(page.locator('html')).toHaveAttribute('data-device', 'tablet');
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(page.locator('html')).toHaveAttribute('data-device', 'tablet');
    await expect(page.locator('#device-library')).toBeVisible();
    await page.screenshot({ path: path.join(qa, 'ipad-desktop-user-agent.png') });
  } finally { await context.close(); }
});
