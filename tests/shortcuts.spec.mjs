import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
const network = new WeakMap();
test.beforeAll(async () => {
  globalThis.measureTextWidth = (_font, text) => [...text].reduce((width, char) => width + (char.codePointAt(0) > 255 ? 12 : 6), 0);
  await init({ module_or_path: await readFile(new URL('../public/vendor/rhwp_bg.wasm', import.meta.url)) });
});
test.beforeEach(async ({ context, baseURL }) => {
  const violations = [];
  network.set(context, violations);
  await context.route('**/*', async route => {
    const request = route.request();
    if (new URL(request.url()).origin !== new URL(baseURL).origin || request.method() !== 'GET' || request.postDataBuffer()?.length) {
      violations.push(request.url()); return route.abort('blockedbyclient');
    }
    await route.continue();
  });
});
test.afterEach(async ({ context }) => { expect(network.get(context)).toEqual([]); });

async function ready(page) {
  await expect(page.locator('#doc-name')).toHaveText('multipage.hwp');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
}
async function open(page) {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(path.join(fixtures, 'multipage.hwp'));
  await ready(page);
}
async function edit(page) {
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#busy-overlay')).toBeHidden();
  const input = page.frameLocator('#editor-host iframe').locator('textarea[aria-label="문서 편집 입력"]');
  await input.focus();
  await page.keyboard.press('Control+Home');
  return input;
}
async function downloadWith(page, action) {
  const waiting = page.waitForEvent('download');
  await action();
  const download = await waiting;
  expect(download.suggestedFilename()).toBe('multipage.hwp');
  const bytes = await readFile(await download.path());
  const doc = new HwpDocument(new Uint8Array(bytes));
  let text;
  try { text = JSON.parse(doc.getTextFileUnicode()); } finally { doc.free(); }
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
  return { bytes, text };
}
async function savedKeys(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const opening = indexedDB.open('hangeuldam-documents-v1', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const database = opening.result;
      const transaction = database.transaction('documents', 'readonly');
      const request = transaction.objectStore('documents').getAllKeys();
      transaction.oncomplete = () => { database.close(); resolve(request.result); };
      transaction.onerror = () => { database.close(); reject(transaction.error); };
    };
  }));
}
async function koreanKey(context, page, key, code, modifiers = 2) {
  const cdp = await context.newCDPSession(page);
  try {
    const windowsVirtualKeyCode = code === 'KeyO' ? 79 : 83;
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, modifiers });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, modifiers });
  } finally { await cdp.detach(); }
}

test('shortcuts: parent Ctrl/Cmd and Korean layout open, download and local save', async ({ page, context }) => {
  // Subscribe before navigation so Playwright's file-dialog interception is installed
  // before input from the separate CDP session can request a native chooser.
  const choosing = page.waitForEvent('filechooser');
  await page.goto('./');
  await koreanKey(context, page, 'ㅐ', 'KeyO');
  await (await choosing).setFiles(path.join(fixtures, 'multipage.hwp'));
  await ready(page);
  const unintendedDownloads = [];
  page.on('download', download => unintendedDownloads.push(download.suggestedFilename()));
  await page.keyboard.press('Meta+s');
  await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  expect(unintendedDownloads).toEqual([]);
  const saved = await downloadWith(page, () => page.keyboard.press('Meta+Shift+s'));
  expect(saved.bytes).toEqual(await readFile(path.join(fixtures, 'multipage.hwp')));
  await page.keyboard.press('Control+s');
  await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  expect(unintendedDownloads).toEqual(['multipage.hwp']);
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  const opening = page.waitForEvent('filechooser');
  await page.keyboard.press('Control+o');
  await (await opening).setFiles(path.join(fixtures, 'multipage.hwp'));
  await ready(page);
});

test('shortcuts: Ctrl/Cmd+S updates one local copy and preserves editing focus without downloading', async ({ page, context }) => {
  await open(page);
  const input = await edit(page);
  await page.keyboard.insertText('공통단축키 ');
  const exported = await downloadWith(page, () => koreanKey(context, page, 'ㄴ', 'KeyS', 10)); // Ctrl + Shift downloads.
  expect(exported.text).toContain('공통단축키 가나다');
  await expect(input).toBeFocused();
  await page.keyboard.insertText('기기보관 ');
  const unintendedDownloads = [];
  page.on('download', download => unintendedDownloads.push(download.suggestedFilename()));
  await koreanKey(context, page, 'ㄴ', 'KeyS'); // Ctrl + S, Korean keyboard active.
  await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#doc-state')).not.toContainText('저장하지 않은');
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  const firstKeys = await savedKeys(page);
  expect(firstKeys).toHaveLength(1);
  await expect(input).toBeFocused();
  // Saving must return the keyboard to the same caret without an extra click/focus call.
  await page.keyboard.insertText('다시저장 ');
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  await page.keyboard.press('Meta+s');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#doc-state')).not.toContainText('저장하지 않은');
  await expect(input).toBeFocused();
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  expect(await savedKeys(page)).toEqual(firstKeys);
  // The selected text, not just the caret focus, must survive a save operation.
  await page.keyboard.press('Shift+Home');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(input).toBeFocused();
  await page.keyboard.insertText('선택보존 ');
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  await page.keyboard.press('Control+s');
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#doc-state')).not.toContainText('저장하지 않은');
  expect(await savedKeys(page)).toEqual(firstKeys);
  expect(unintendedDownloads).toEqual([]);
  const choosing = page.waitForEvent('filechooser');
  await page.keyboard.press('Meta+o');
  await (await choosing).setFiles(path.join(fixtures, 'multipage.hwp'));
  await ready(page);
  await page.reload();
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  await page.locator('#saved-list .saved-open').click();
  await ready(page);
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('선택보존 가나다');
  await expect(page.locator('#document-text')).not.toContainText('다시저장');
});

test('shortcuts: Studio undo, redo, select all, copy and paste still operate on document text', async ({ page, context, baseURL }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(baseURL).origin });
  await open(page);
  await edit(page);
  await page.keyboard.insertText('복사검증 ');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('복사검증 가나다');
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Control+v');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  const exported = await downloadWith(page, () => page.keyboard.press('Control+Shift+s'));
  expect(exported.text.split('복사검증').length - 1).toBe(2);
});

test('shortcuts: help is modal, preserves question-mark typing and closes before fullscreen', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 740 });
  await open(page);
  const input = await edit(page);
  await page.keyboard.press('Shift+Slash');
  await page.locator('#toggle-fullscreen').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('drop-zone');
  await page.locator('#document-shortcuts').click();
  await expect(page.getByRole('dialog', { name: '키보드 단축키' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('shortcuts-help.png') });
  await expect(page.locator('#editor-host')).toHaveAttribute('inert', '');
  await page.keyboard.insertText('도움말중입력금지');
  await page.keyboard.press('Control+s');
  await page.keyboard.press('Control+Shift+s');
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shortcuts-dialog')).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('drop-zone');
  const frame = page.frameLocator('#editor-host iframe');
  await input.focus();
  await frame.locator('.menu-item[data-menu="insert"] > .menu-title').click();
  await frame.locator('.menu-item[data-menu="insert"] .md-item[data-cmd="insert:hyperlink"]').click();
  await expect(frame.locator('.dialog-hyperlink')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(frame.locator('.dialog-hyperlink')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('drop-zone');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBe(null);
  await input.focus();
  const exported = await downloadWith(page, () => page.keyboard.press('Control+Shift+s'));
  expect(exported.text).toContain('?가나다');
  expect(exported.text).not.toContain('도움말중입력금지');
});

test('shortcuts: composition and legacy 229 keys cannot open or save before Korean text commits', async ({ page, context }) => {
  await open(page);
  const input = await edit(page);
  const actions = [];
  page.on('download', () => actions.push('download'));
  page.on('filechooser', chooser => { actions.push('open'); void chooser.setFiles([]); });
  const cdp = await context.newCDPSession(page);
  try {
    for (const text of ['ㅎ', '하', '한']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    for (const state of [{ isComposing: true }, { keyCode: 229 }]) {
      for (const command of [{ key: 'ㅐ', code: 'KeyO' }, { key: 'ㄴ', code: 'KeyS' }, { key: 'ㄴ', code: 'KeyS', shiftKey: true }]) {
        await input.dispatchEvent('keydown', { bubbles: true, cancelable: true, ctrlKey: true, ...command, ...state });
      }
    }
    await cdp.send('Input.insertText', { text: '한' });
    for (const text of ['ㄱ', '그', '글']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await cdp.send('Input.insertText', { text: '글' });
  } finally { await cdp.detach(); }
  expect(actions).toEqual([]);
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(0);
  const exported = await downloadWith(page, () => page.keyboard.press('Control+Shift+s'));
  expect(exported.text).toContain('한글가나다');
  expect(exported.text).not.toContain('한한');
});
