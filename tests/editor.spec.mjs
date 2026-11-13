import { test, expect } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
const qa = process.env.QA_OUTPUT_DIR || fileURLToPath(new URL('../.test-data/results/', import.meta.url));
const magic = [208, 207, 17, 224, 161, 177, 26, 225];

// The downloaded file is parsed independently from the live editor instance.
test.beforeAll(async () => {
  globalThis.measureTextWidth = (_font, text) => [...text].reduce((total, char) => total + (char.codePointAt(0) > 255 ? 12 : 6), 0);
  await init({ module_or_path: await readFile(new URL('../public/vendor/rhwp_bg.wasm', import.meta.url)) });
  await mkdir(qa, { recursive: true });
});

async function open(page, name) {
  await page.goto('./');
  await page.locator('#file-input').setInputFiles(path.join(fixtures, name));
  await expect(page.locator('#doc-name')).toHaveText(name);
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await expect(page.locator('#error-banner')).toBeHidden();
}

async function edit(page) {
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
  const frame = await page.locator('#editor-host iframe').contentFrame();
  await expect(frame.locator('textarea[aria-label="문서 편집 입력"]')).toHaveCount(1);
  await frame.locator('textarea[aria-label="문서 편집 입력"]').focus();
  return frame;
}

async function downloadCurrent(page, filename = 'edited.hwp') {
  const downloading = page.waitForEvent('download', { timeout: 60000 });
  await page.locator('#download-hwp').click();
  const downloaded = await downloading;
  expect(downloaded.suggestedFilename()).toMatch(/\.hwp$/i);
  const target = test.info().outputPath(filename);
  await downloaded.saveAs(target);
  await expect(page.locator('#busy-overlay')).toBeHidden();
  await expect(page.locator('#error-banner')).toBeHidden();
  const bytes = await readFile(target);
  expect([...bytes.subarray(0, 8)]).toEqual(magic);
  return bytes;
}

function inspect(bytes) {
  const doc = new HwpDocument(new Uint8Array(bytes));
  try {
    const pages = doc.pageCount();
    return {
      text: JSON.parse(doc.getTextFileUnicode()),
      controls: JSON.parse(doc.getControls()),
      pages,
      paragraphs: Array.from({ length: doc.getSectionCount() }, (_, section) =>
        Array.from({ length: doc.getParagraphCount(section) }, (_, para) => doc.getTextRange(section, para, 0, doc.getParagraphLength(section, para)))),
      runs: Array.from({ length: pages }, (_, page) => JSON.parse(doc.getPageTextLayout(page)).runs),
      svg: doc.renderPageSvg(0),
      tables: Array.from({ length: pages }, (_, page) => JSON.parse(doc.getPageControlLayout(page)).controls)
        .flat().filter(control => control.type === 'table').map(table => ({
          rowCount: table.rowCount, colCount: table.colCount,
          cells: table.cells.map(({ row, col, rowSpan, colSpan }) => ({ row, col, rowSpan, colSpan })),
        })),
    };
  } finally { doc.free(); }
}

async function beginText(page, frame, text) {
  await frame.locator('textarea[aria-label="문서 편집 입력"]').focus();
  await page.keyboard.press('Control+Home');
  await page.keyboard.insertText(text);
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은', { timeout: 10000 });
}

test('edit HWP using keyboard: Korean, emoji, paragraph break, undo/redo and HWP round trip', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page, 'multipage.hwp');
  const frame = await edit(page);
  await beginText(page, frame, '편집완료😀 ');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('둘째줄');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  const saved = inspect(await downloadCurrent(page, 'body-edited.hwp'));
  expect(saved.text).toContain('편집완료😀');
  expect(saved.text).toContain('둘째가나다');
  expect(saved.text).not.toContain('둘째줄');
  expect(saved.text).toContain('new page');
  expect(saved.paragraphs[0].length).toBe(4);
  expect(saved.pages).toBe(2);
  await expect(page.locator('#doc-state')).not.toContainText('저장하지 않은');
  await page.screenshot({ path: path.join(qa, 'editor-body.png') });
  expect(errors).toEqual([]);
});

test('selected text bold formatting survives exported HWP', async ({ page }) => {
  await open(page, 'multipage.hwp');
  const frame = await edit(page);
  await beginText(page, frame, '서식확인');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Control+b');
  const saved = inspect(await downloadCurrent(page, 'bold-edited.hwp'));
  expect(saved.text).toContain('서식확인가나다');
  const boldText = saved.runs.flat().filter(run => run.bold).map(run => run.text).join('');
  expect(boldText).toContain('서식확인');
});

test('unsaved close is guarded and local save retains edited file after reload', async ({ page }) => {
  await open(page, 'multipage.hwp');
  const frame = await edit(page);
  await beginText(page, frame, '기기저장검증 ');
  const prompt = page.waitForEvent('dialog');
  const closing = page.locator('#close-document').click();
  const dialog = await prompt;
  expect(dialog.message()).toContain('저장하지 않은');
  await dialog.dismiss(); await closing;
  await expect(page.locator('#editor-host iframe')).toHaveCount(1);
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  await page.locator('#save-local').click();
  await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
  await expect(page.locator('#doc-state')).not.toContainText('저장하지 않은');
  await page.reload();
  await page.locator('#saved-list .saved-open').click();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('기기저장검증 가나다');
});

test('read view preserves unsaved edits; original download remains byte-identical', async ({ page }) => {
  await open(page, 'multipage.hwp');
  const frame = await edit(page);
  await beginText(page, frame, '미리보기 ');
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('미리보기 가나다');
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  const downloading = page.waitForEvent('download');
  await page.locator('#download-original').click();
  const original = await downloading;
  expect(await readFile(await original.path())).toEqual(await readFile(path.join(fixtures, 'multipage.hwp')));
  const saved = inspect(await downloadCurrent(page, 'preview-edited.hwp'));
  expect(saved.text).toContain('미리보기 가나다');
});

test('HWP with images retains its controls after editing and HWP save', async ({ page }) => {
  const before = inspect(await readFile(path.join(fixtures, 'pictures-and-tables.hwp')));
  await open(page, 'pictures-and-tables.hwp');
  const frame = await edit(page);
  await beginText(page, frame, '그림보존 ');
  const after = inspect(await downloadCurrent(page, 'pictures-edited.hwp'));
  expect(after.text).toContain('그림보존 글자취급');
  expect(after.controls.map(control => control.ctrlId)).toEqual(before.controls.map(control => control.ctrlId));
  expect(after.svg).toContain('<image');
  expect(after.pages).toBe(before.pages);
});


test('edit a real HWPX table cell by clicking its text and save as HWP', async ({ page }) => {
  const before = inspect(await readFile(path.join(fixtures, 'table.hwpx')));
  await open(page, 'table.hwpx');
  const frame = await edit(page);
  const cell = before.runs.flat().find(run => run.cellIdx === 0);
  const canvas = frame.locator('canvas.document-page-canvas').first();
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const modelWidth = Number(before.svg.match(/viewBox="0 0 ([\d.]+)/)[1]);
  const scale = box.width / modelWidth;
  await canvas.click({ position: { x: (cell.x + 1) * scale, y: (cell.y + cell.h / 2) * scale } });
  await page.keyboard.press('Home');
  await page.keyboard.insertText('셀수정😀 ');
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  const after = inspect(await downloadCurrent(page, 'table-edited.hwp'));
  expect(after.text).toContain('셀수정😀 1');
  expect(after.tables).toEqual(before.tables);
  expect(after.controls.map(control => control.ctrlId)).toEqual(before.controls.map(control => control.ctrlId));
  expect(after.runs.flat().filter(run => run.cellIdx === 0).map(run => run.text).join('')).toContain('셀수정😀 1');
  for (const value of ['2', '3', '4', '5']) expect(after.text).toContain(value);
  await page.screenshot({ path: path.join(qa, 'editor-table.png') });
});

test('offline reload supports editing, local save, and HWP download without external requests', async ({ page, context }) => {
  test.setTimeout(180000);
  const external = [], writes = [];
  const origin = new URL(test.info().project.use.baseURL).origin;
  context.on('request', req => {
    if (/^https?:/.test(req.url()) && new URL(req.url()).origin !== origin) external.push(req.url());
    if (!['GET', 'HEAD'].includes(req.method())) writes.push(req.method());
  });
  await open(page, 'multipage.hwp');
  await page.locator('#save-local').click();
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(1);
  await page.locator('#offline-button').click();
  await expect(page.locator('#offline-status')).toContainText('오프라인 준비 완료', { timeout: 120000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#offline-status')).toContainText('오프라인 사용 중');
  await page.locator('#saved-list .saved-open').click();
  await expect(page.locator('#page-host svg')).toBeVisible();
  const frame = await edit(page);
  await beginText(page, frame, '오프라인수정😀 ');
  await page.locator('#save-local').click();
  await expect(page.locator('#save-local')).toHaveText('기기에 저장됨');
  const saved = inspect(await downloadCurrent(page, 'offline-edited.hwp'));
  expect(saved.text).toContain('오프라인수정😀 가나다');
  await page.reload();
  await page.locator('#saved-list .saved-open').click();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('오프라인수정😀 가나다');
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  await page.screenshot({ path: path.join(qa, 'editor-offline-saved.png') });
});

test('Korean IME composition commits once and survives HWP export', async ({ page, context }) => {
  await open(page, 'multipage.hwp');
  const frame = await edit(page);
  await frame.locator('textarea[aria-label="문서 편집 입력"]').focus();
  await page.keyboard.press('Control+Home');
  const cdp = await context.newCDPSession(page);
  try {
    for (const text of ['ㅎ', '하', '한']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await cdp.send('Input.insertText', { text: '한' });
    for (const text of ['ㄱ', '그', '글']) await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
    await cdp.send('Input.insertText', { text: '글' });
  } finally { await cdp.detach(); }
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  const saved = inspect(await downloadCurrent(page, 'ime-edited.hwp'));
  expect(saved.paragraphs[0][0]).toBe('한글가나다');
});
