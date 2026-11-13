import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
const publicRoot = fileURLToPath(new URL('../public/', import.meta.url));
const magic = [208, 207, 17, 224, 161, 177, 26, 225];

test.beforeAll(async () => {
  globalThis.measureTextWidth = (_font, text) => [...text].reduce((width, char) => width + (char.codePointAt(0) > 255 ? 12 : 6), 0);
  await init({ module_or_path: await readFile(new URL('../public/vendor/rhwp_bg.wasm', import.meta.url)) });
});

function inspect(bytes) {
  const doc = new HwpDocument(new Uint8Array(bytes));
  try {
    return {
      text: JSON.parse(doc.getTextFileUnicode()),
      pages: doc.pageCount(),
      controls: JSON.parse(doc.getControls()).map(control => control.ctrlId),
    };
  } finally { doc.free(); }
}

async function opened(page, name) {
  await expect(page.locator('#doc-name')).toHaveText(name);
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await expect(page.locator('#error-banner')).toBeHidden();
}

async function downloaded(page, name) {
  const waiting = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#download-hwp').click();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe(name);
  const output = test.info().outputPath(name);
  await download.saveAs(output);
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
  const bytes = await readFile(output);
  expect([...bytes.subarray(0, 8)]).toEqual(magic);
  return bytes;
}

async function publicFiles(directory = publicRoot, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await publicFiles(path.join(directory, entry.name), `${relative}/`));
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

test('document filename and contents stay local through editing, HWP download and device save', async ({ page, context, baseURL }) => {
  const filenameCanary = 'HANGEULDAM_PRIVATE_FILENAME_94c326ad';
  const sourceCanary = 'HANGEULDAM_PRIVATE_SOURCE_8a07bce2';
  const editCanary = 'HANGEULDAM_PRIVATE_EDIT_42de590f';
  const localCanary = 'HANGEULDAM_PRIVATE_LOCAL_20ba486c';
  const canaries = [filenameCanary, sourceCanary, editCanary, localCanary];
  const canaryForms = canaries.flatMap(value => [value, encodeURIComponent(value), Buffer.from(value).toString('base64'), Buffer.from(value, 'utf16le').toString('base64')]);
  const base = new URL(baseURL);
  const root = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  const allowedPaths = new Set([root, ...((await publicFiles()).map(file => `${root}${file}`))]);
  const requests = [], violations = [];

  // Fail closed before any external endpoint or document-bearing request is sent.
  // Test content is synthetic; no user's document is involved in this check.
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataBuffer();
    const wire = [request.url(), body?.toString('utf8') || '', body?.toString('utf16le') || ''].join('\n');
    const record = { method: request.method(), url: request.url(), bodyBytes: body?.length || 0 };
    requests.push(record);
    const queryIsStatic = [...url.searchParams].every(([key, value]) =>
      (key === 'chrome' && value === 'embed') || (key === 'renderer' && value === 'canvas2d'));
    if (request.method() !== 'GET' || url.origin !== base.origin ||
        !allowedPaths.has(decodeURIComponent(url.pathname)) || !queryIsStatic || body?.length ||
        canaryForms.some(value => wire.includes(value))) {
      violations.push(record);
      return route.abort('blockedbyclient');
    }
    await route.continue();
  });
  await context.routeWebSocket('**/*', socket => {
    violations.push({ method: 'WEBSOCKET', url: socket.url() });
    socket.close();
  });

  const doc = new HwpDocument(new Uint8Array(await readFile(path.join(fixtures, 'multipage.hwp'))));
  let source;
  try {
    doc.insertText(0, 0, 0, `${sourceCanary} `);
    source = Buffer.from(doc.exportHwp());
  } finally { doc.free(); }
  expect(inspect(source).text).toContain(sourceCanary);
  const name = `${filenameCanary}.hwp`;
  await page.goto('./');
  await page.locator('#file-input').setInputFiles({ name, mimeType: 'application/x-hwp', buffer: source });
  await opened(page, name);
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#busy-overlay')).toBeHidden();
  const frame = page.frameLocator('#editor-host iframe');
  const input = frame.locator('textarea[aria-label="문서 편집 입력"]');
  await input.focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText(`${editCanary} `);
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  const exported = inspect(await downloaded(page, name));
  expect(exported.text).toContain(sourceCanary);
  expect(exported.text).toContain(editCanary);

  await input.focus();
  await page.keyboard.insertText(`${localCanary} `);
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  await page.locator('#save-local').click();
  await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  await page.reload();
  await page.locator('#saved-list .saved-open').click();
  await opened(page, name);
  await page.locator('#toggle-text').click();
  for (const marker of [sourceCanary, editCanary, localCanary]) await expect(page.locator('#document-text')).toContainText(marker);
  await page.waitForLoadState('networkidle');
  expect(requests.length).toBeGreaterThan(10);
  expect(requests.some(request => request.url.includes('/studio/'))).toBe(true);
  expect(violations).toEqual([]);
  await test.info().attach('static-network-requests.json', { body: JSON.stringify(requests, null, 2), contentType: 'application/json' });
});

test('read-mode HWP save keeps its original filename and bytes when another file is selected mid-save', async ({ page }) => {
  await page.addInitScript(() => {
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      if (window.__holdNextFileRead) {
        window.__holdNextFileRead = false;
        return new Promise((resolve, reject) => {
          window.__releaseFileRead = () => read.call(this).then(resolve, reject);
        });
      }
      return read.call(this);
    };
  });
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'multipage.hwp'));
  await opened(page, 'multipage.hwp');
  await page.evaluate(() => { window.__holdNextFileRead = true; });
  const waiting = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#download-hwp').click();
  await page.waitForFunction(() => typeof window.__releaseFileRead === 'function');
  await expect(page.locator('#busy-overlay')).toBeVisible();
  // Exercise the onchange entry directly, including while the visible open button is disabled.
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'pictures-and-tables.hwp'));
  await expect(page.locator('#doc-name')).toHaveText('multipage.hwp');
  await page.evaluate(() => window.__releaseFileRead());
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('multipage.hwp');
  expect(await readFile(await download.path())).toEqual(await readFile(path.join(fixtures, 'multipage.hwp')));
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'pictures-and-tables.hwp'));
  await opened(page, 'pictures-and-tables.hwp');
});

for (const filename of ['table.hwpx', 'multipage.hwp']) {
  test(`${filename} export recovers after the reader worker crashes`, async ({ page }) => {
    await page.addInitScript(() => {
      const OriginalWorker = window.Worker;
      window.__readerWorkers = [];
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args);
          if (String(args[0]).includes('reader.worker.js')) window.__readerWorkers.push(this);
        }
      };
    });
    const before = inspect(await readFile(path.join(fixtures, filename)));
    await page.goto('./');
    await page.locator('#file-input').setInputFiles(path.join(fixtures, filename));
    await opened(page, filename);
    await page.evaluate(() => window.__readerWorkers.at(-1).dispatchEvent(new ErrorEvent('error', {
      message: 'Injected reader crash for recovery regression', cancelable: true,
    })));
    await expect(page.locator('#error-message')).toContainText('문서 엔진을 실행하지 못했습니다');
    await page.locator('#dismiss-error').click();
    const after = inspect(await downloaded(page, filename.replace(/\.hwpx?$/i, '.hwp')));
    expect(after.text).toBe(before.text);
    expect(after.pages).toBe(before.pages);
    expect(after.controls).toEqual(before.controls);
    expect(await page.evaluate(() => window.__readerWorkers.length)).toBeGreaterThan(1);
    // The restored worker must keep the document usable after verifying the exported copy.
    await page.locator('#toggle-text').click();
    await expect(page.locator('#document-text')).toHaveText(before.text);
    await expect(page.locator('#error-banner')).toBeHidden();
  });
}

test('hyperlink dialog preview cannot open a tab or send document data outside the host', async ({ page, context, baseURL }) => {
  const canary = 'HANGEULDAM_HYPERLINK_PRIVATE_7d206c5a';
  const target = `https://example.com/?document=${canary}`;
  const origin = new URL(baseURL).origin;
  const externalRequests = [], popups = [];
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== origin || request.method() !== 'GET' ||
        request.url().includes(canary) || request.postData()?.includes(canary)) {
      externalRequests.push({ method: request.method(), url: request.url() });
      // Block before dispatch: even the intentionally failing baseline must not send the canary.
      return route.abort('blockedbyclient');
    }
    await route.continue();
  });
  context.on('page', popup => { if (popup !== page) popups.push(popup); });
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'multipage.hwp'));
  await opened(page, 'multipage.hwp');
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#busy-overlay')).toBeHidden();
  const frame = page.frameLocator('#editor-host iframe');
  await frame.locator('textarea[aria-label="문서 편집 입력"]').focus();
  await page.keyboard.press('Control+Home');
  await frame.locator('.menu-item[data-menu="insert"] > .menu-title').click();
  await frame.locator('.menu-item[data-menu="insert"] .md-item[data-cmd="insert:hyperlink"]').click();
  await expect(frame.locator('.dialog-hyperlink')).toBeVisible();
  await frame.locator('#hyperlink-text').fill('문서 링크 테스트');
  await frame.locator('#hyperlink-uri').fill(target);
  await expect(frame.locator('#hyperlink-preview')).toBeEnabled();
  await frame.locator('#hyperlink-preview').click();
  // Allow asynchronous popup creation/navigation to reach the pre-dispatch route guard.
  await page.waitForTimeout(750);
  await expect(frame.locator('.dialog-hyperlink')).toBeVisible();
  expect.soft(externalRequests, 'Preview must honor the host link handler before requesting a URL').toEqual([]);
  expect(popups, 'Preview must not create even an about:blank tab').toHaveLength(0);
});
