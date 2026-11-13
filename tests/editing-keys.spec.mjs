import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import init, { HwpDocument } from '@rhwp/core';

const fixtures = process.env.FIXTURE_DIR || fileURLToPath(new URL('../.test-data/fixtures/', import.meta.url));
test.beforeAll(async () => {
  globalThis.measureTextWidth = (_font, text) => [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 255 ? 12 : 6), 0);
  await init({ module_or_path: await readFile(new URL('../public/vendor/rhwp_bg.wasm', import.meta.url)) });
});
function inspect(bytes) {
  const doc = new HwpDocument(new Uint8Array(bytes));
  try {
    return { text: JSON.parse(doc.getTextFileUnicode()), pages: doc.pageCount(), svg: doc.renderPageSvg(0),
      runs: Array.from({ length: doc.pageCount() }, (_, page) => JSON.parse(doc.getPageTextLayout(page)).runs).flat(),
      tables: Array.from({ length: doc.pageCount() }, (_, page) => JSON.parse(doc.getPageControlLayout(page)).controls).flat()
        .filter(control => control.type === 'table').map(table => ({ rows: table.rowCount, cols: table.colCount,
          cells: table.cells.map(({ row, col, rowSpan, colSpan }) => ({ row, col, rowSpan, colSpan })) })) };
  } finally { doc.free(); }
}
async function openEditor(page, filename) {
  await page.goto('./');
  if (filename) await page.locator('#file-input').setInputFiles(path.join(fixtures, filename));
  else await page.locator('#sample-button').click();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await expect(page.locator('#busy-overlay')).toBeHidden();
  return page.frameLocator('#editor-host iframe');
}
async function replaceDocument(page, frame, lines) {
  await frame.locator('textarea[aria-label="문서 편집 입력"]').focus();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText(lines[0]);
  for (const line of lines.slice(1)) { await page.keyboard.press('Enter'); await page.keyboard.insertText(line); }
  await page.keyboard.press('Control+Home');
}
async function exported(page) {
  // Read back independently from serialized HWP, not the editor's selection or input buffer.
  const values = await page.locator('#editor-host iframe').evaluate(async frame =>
    Array.from((await frame.contentWindow.rhwpStudio.hangeuldam.exportHwpWithReport()).bytes));
  return inspect(values);
}
async function keys(page, names) { for (const name of names) await page.keyboard.press(name); }

test('basic editing: Home/End selections replace visual lines, document edges and adjacent lines', async ({ page }) => {
  const frame = await openEditor(page);
  const lines = ['alpha beta gamma', 'delta epsilon zeta'];
  for (const [navigation, expected] of [
    [['End', 'Shift+Home'], 'REPLACED\r\ndelta epsilon zeta'],
    [['Shift+End'], 'REPLACED\r\ndelta epsilon zeta'],
    [['Control+Shift+End'], 'REPLACED'],
    [['Control+End', 'Control+Shift+Home'], 'REPLACED'],
    [['Shift+ArrowDown'], 'REPLACEDdelta epsilon zeta'],
    [['ArrowDown', 'Shift+ArrowUp'], 'REPLACEDdelta epsilon zeta'],
  ]) {
    await replaceDocument(page, frame, lines); await keys(page, navigation);
    await page.keyboard.insertText('REPLACED');
    expect((await exported(page)).text, navigation.join(' → ')).toBe(expected);
  }
  const wrapped = '가나다라마바사아자차카타파하 '.repeat(30);
  await replaceDocument(page, frame, [wrapped]);
  await keys(page, ['Control+End', 'Shift+Home']); await page.keyboard.insertText('끝줄치환');
  const lastLine = (await exported(page)).text;
  expect(lastLine.startsWith(wrapped.slice(0, 100))).toBe(true);
  expect(lastLine.endsWith('끝줄치환')).toBe(true);
  expect(lastLine.length).toBeLessThan(wrapped.length);
  await replaceDocument(page, frame, [wrapped]);
  await page.keyboard.press('Shift+End'); await page.keyboard.insertText('첫줄치환');
  const firstLine = (await exported(page)).text;
  expect(firstLine.startsWith('첫줄치환')).toBe(true);
  expect(firstLine.endsWith(wrapped.slice(-100))).toBe(true);
  expect(firstLine.length).toBeGreaterThan(100);
});

test('basic editing: word selection, repeated arrow keys, deletion, undo and line/tab input retain content', async ({ page }) => {
  const frame = await openEditor(page);
  const lines = ['alpha beta gamma', 'delta epsilon zeta'];
  for (const [navigation, replacement, expected] of [
    [['Control+Shift+ArrowRight'], 'WORD', 'WORDbeta gamma\r\ndelta epsilon zeta'],
    [['End', 'Control+Shift+ArrowLeft'], 'WORD', 'alpha beta WORD\r\ndelta epsilon zeta'],
    [['Control+Delete'], '', 'beta gamma\r\ndelta epsilon zeta'],
    [['End', 'Control+Backspace'], '', 'alpha beta \r\ndelta epsilon zeta'],
    [['Delete'], '', 'lpha beta gamma\r\ndelta epsilon zeta'],
    [['End', 'Backspace'], '', 'alpha beta gamm\r\ndelta epsilon zeta'],
    [['End', 'Shift+Enter'], 'NEW', 'alpha beta gamma\nNEW\r\ndelta epsilon zeta'],
    [['End', 'Tab'], 'TAB', 'alpha beta gamma\tTAB\r\ndelta epsilon zeta'],
  ]) {
    await replaceDocument(page, frame, lines); await keys(page, navigation);
    if (replacement) await page.keyboard.insertText(replacement);
    expect((await exported(page)).text, navigation.join(' → ')).toBe(expected);
  }
  await replaceDocument(page, frame, lines);
  await page.keyboard.down('Shift');
  for (let i = 0; i < 3; i++) await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight'); await page.keyboard.up('Shift');
  await page.keyboard.insertText('REPEAT');
  expect((await exported(page)).text).toBe('REPEATha beta gamma\r\ndelta epsilon zeta');
  // Check the history of an explicit delete independently from text replacement grouping.
  await replaceDocument(page, frame, lines);
  await keys(page, ['Control+Shift+ArrowRight', 'Delete']);
  expect((await exported(page)).text).toBe('beta gamma\r\ndelta epsilon zeta');
  await page.keyboard.press('Control+z');
  expect((await exported(page)).text).toBe(lines.join('\r\n'));
  await page.keyboard.press('Control+Shift+z');
  expect((await exported(page)).text).toBe('beta gamma\r\ndelta epsilon zeta');
  await page.keyboard.press('Control+f');
  const search = frame.locator('.find-dialog-input').first();
  await search.fill('검색어 입력');
  await keys(page, ['End', 'Shift+Home']); await page.keyboard.insertText('새 검색');
  await expect(search).toHaveValue('새 검색');
  await page.keyboard.press('Escape');
  expect((await exported(page)).text).toBe('beta gamma\r\ndelta epsilon zeta');
});

test('basic editing: Shift PageUp/PageDown extends selection across visible screens', async ({ page }) => {
  const frame = await openEditor(page);
  const original = '화면 이동 선택 확인을 위한 문장입니다. '.repeat(160);
  await replaceDocument(page, frame, [original]);
  expect((await exported(page)).pages).toBeGreaterThan(1);
  await page.keyboard.press('Shift+PageDown'); await page.keyboard.insertText('다음화면선택');
  const down = (await exported(page)).text;
  expect(down.startsWith('다음화면선택')).toBe(true);
  expect(down.length).toBeLessThan(original.length);
  expect(down.endsWith(original.slice(-100))).toBe(true);
  await replaceDocument(page, frame, [original]);
  await keys(page, ['Control+End', 'Shift+PageUp']); await page.keyboard.insertText('이전화면선택');
  const up = (await exported(page)).text;
  expect(up.startsWith(original.slice(0, 100))).toBe(true);
  expect(up.endsWith('이전화면선택')).toBe(true);
  expect(up.length).toBeLessThan(original.length);
});

test('basic editing: Home/End selection and Tab/ShiftTab stay inside table cells', async ({ page }) => {
  const before = inspect(await readFile(path.join(fixtures, 'table.hwpx')));
  const frame = await openEditor(page, 'table.hwpx');
  const firstCell = before.runs.find(run => run.cellIdx === 0);
  const canvas = frame.locator('canvas.document-page-canvas').first();
  await expect(canvas).toBeVisible();
  const bounds = await canvas.boundingBox();
  const scale = bounds.width / Number(before.svg.match(/viewBox="0 0 ([\d.]+)/)[1]);
  await canvas.click({ position: { x: (firstCell.x + 1) * scale, y: (firstCell.y + firstCell.h / 2) * scale } });
  await keys(page, ['Home', 'Shift+End']); await page.keyboard.insertText('첫셀');
  await keys(page, ['Tab', 'Home', 'Shift+End']); await page.keyboard.insertText('다음셀');
  await keys(page, ['Shift+Tab', 'End']); await page.keyboard.insertText('복귀');
  const after = await exported(page);
  expect(after.runs.filter(run => run.cellIdx === 0).map(run => run.text).join('')).toContain('첫셀복귀');
  expect(after.runs.filter(run => run.cellIdx === 1).map(run => run.text).join('')).toContain('다음셀');
  expect(after.tables).toEqual(before.tables);
  expect(after.text).toContain('3'); expect(after.text).toContain('4'); expect(after.text).toContain('5');
  await expect(page.locator('#error-banner')).toBeHidden();
});

// These controls used to leave the user outside the document input in some browser flows.
test('basic editing: help and fullscreen return to the document for Shift Home/End without refocusing', async ({ page }) => {
  const frame = await openEditor(page);
  const input = frame.locator('textarea[aria-label="문서 편집 입력"]');
  await expect(input).toBeFocused();
  await page.keyboard.press('Control+a'); await page.keyboard.insertText('선택할 문장');
  await page.locator('#document-shortcuts').click();
  await expect(page.locator('#shortcuts-dialog')).toBeVisible();
  await page.locator('#close-shortcuts').click();
  await expect(input).toBeFocused();
  await page.keyboard.press('Shift+Home'); await page.keyboard.insertText('도움말 복귀');
  expect((await exported(page)).text).toBe('도움말 복귀');
  await page.locator('#toggle-fullscreen').click();
  await expect(page.locator('#toggle-fullscreen')).toHaveAttribute('aria-pressed', 'true');
  await expect(input).toBeFocused();
  await keys(page, ['Home', 'Shift+End']); await page.keyboard.insertText('전체화면 복귀');
  expect((await exported(page)).text).toBe('전체화면 복귀');
  await page.keyboard.press('Escape');
  await expect(page.locator('#toggle-fullscreen')).toHaveAttribute('aria-pressed', 'false');
});
