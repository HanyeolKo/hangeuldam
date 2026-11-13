import init, { HwpDocument } from '@rhwp/core';
import { readFile, writeFile } from 'node:fs/promises';
globalThis.measureTextWidth = (font, text) => [...text].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 13 : 7), 0);
await init({ module_or_path: await readFile(new URL('../node_modules/@rhwp/core/rhwp_bg.wasm', import.meta.url)) });
const doc = HwpDocument.createEmpty();
const lines = [
  '한글담 — 내 문서를, 어디서나.',
  '',
  'HWP · HWPX 문서를 브라우저에서 읽고 편집하세요.',
  '이 문서는 한글담의 기능을 확인하기 위해 만든 예제 HWP 파일입니다.',
  '',
  '1. 파일 열기',
  '내 기기의 한글 파일을 선택하거나 화면에 끌어다 놓으세요.',
  '문서는 서버로 전송되지 않고 브라우저 안에서 처리됩니다.',
  '',
  '2. 편집하고 HWP로 저장하기',
  '편집하기를 누르고 문서에서 글자, 문단, 표를 수정하세요.',
  'HWP 저장 또는 Ctrl+S를 누르면 수정한 파일을 내려받습니다.',
  '',
  '3. 오프라인으로 사용하기',
  '온라인에서 오프라인 사용 준비를 누르고 완료 안내를 확인하세요.',
  '다시 볼 문서는 기기에 저장을 눌러 내 문서함에 보관하세요.',
  '인터넷을 끊어도 같은 주소에서 편집과 HWP 저장이 가능합니다.',
  '',
  '지원 안내',
  '원본 파일은 유지됩니다. 편집본은 별도 HWP 파일로 저장하세요.',
  '일부 글꼴과 복잡한 문서 배치는 원본과 다를 수 있습니다.',
  '브라우저 데이터를 삭제하면 저장한 문서와 오프라인 앱도 지워집니다.',
];
for (let i = 0; i < lines.length; i++) {
  if (i) doc.insertParagraph(0, i);
  if (lines[i]) doc.insertText(0, i, 0, lines[i]);
}
await writeFile(new URL('../public/sample.hwp', import.meta.url), doc.exportHwp());
console.log('Sample created:', doc.pageCount(), 'page(s)');
doc.free();
