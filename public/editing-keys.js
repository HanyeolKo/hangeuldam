// Basic editing is owned by Studio's trusted keyboard handler, including repeat,
// IME composition, visual line layout, nested table cells and the undo history.
// These descriptors make the supported keys discoverable without dispatching a
// second synthetic event or bypassing the engine's document-mode guards.
const key = (code, modifiers = {}) => ({ code, ...modifiers });
const native = (id, label, group, keys, extra = {}) => ({
  id, label, group, scope: 'editor', handler: 'nativeEditing', nativeEditing: true, keys, ...extra,
});
const word = (code, shift = false) => [
  key(code, { ctrl: true, shift, platform: 'other' }),
  key(code, { alt: true, shift, platform: 'mac' }),
];
const lineEdge = (code, arrow, shift = false) => [
  key(code, { shift }), key(arrow, { meta: true, shift, platform: 'mac' }),
];
const documentEdge = (code, arrow, shift = false) => [
  key(code, { ctrl: true, shift }),
  key(code, { meta: true, shift, platform: 'mac' }),
  key(arrow, { meta: true, shift, platform: 'mac' }),
];

export const EDITING_KEYMAP = Object.freeze([
  native('cursor.left', '이전 글자로 이동', '기본 이동', [key('ArrowLeft')]),
  native('cursor.right', '다음 글자로 이동', '기본 이동', [key('ArrowRight')]),
  native('cursor.up', '위 줄로 이동', '기본 이동', [key('ArrowUp')]),
  native('cursor.down', '아래 줄로 이동', '기본 이동', [key('ArrowDown')]),
  native('cursor.lineStart', '현재 줄 처음으로 이동', '기본 이동', lineEdge('Home', 'ArrowLeft')),
  native('cursor.lineEnd', '현재 줄 끝으로 이동', '기본 이동', lineEdge('End', 'ArrowRight')),
  native('cursor.wordPrevious', '이전 단어로 이동', '기본 이동', word('ArrowLeft')),
  native('cursor.wordNext', '다음 단어로 이동', '기본 이동', word('ArrowRight')),
  native('cursor.paragraphPrevious', '이전 문단으로 이동', '기본 이동', [key('ArrowUp', { ctrl: true })]),
  native('cursor.paragraphNext', '다음 문단으로 이동', '기본 이동', [key('ArrowDown', { ctrl: true })]),
  native('cursor.documentStart', '문서 처음으로 이동', '기본 이동', documentEdge('Home', 'ArrowUp')),
  native('cursor.documentEnd', '문서 끝으로 이동', '기본 이동', documentEdge('End', 'ArrowDown')),
  native('cursor.screenPrevious', '이전 화면으로 이동', '기본 이동', [key('PageUp')]),
  native('cursor.screenNext', '다음 화면으로 이동', '기본 이동', [key('PageDown')]),

  native('selection.left', '이전 글자까지 선택', '기본 선택', [key('ArrowLeft', { shift: true })]),
  native('selection.right', '다음 글자까지 선택', '기본 선택', [key('ArrowRight', { shift: true })]),
  native('selection.up', '위 줄까지 선택', '기본 선택', [key('ArrowUp', { shift: true })]),
  native('selection.down', '아래 줄까지 선택', '기본 선택', [key('ArrowDown', { shift: true })]),
  native('selection.lineStart', '현재 줄 처음까지 선택', '기본 선택', lineEdge('Home', 'ArrowLeft', true)),
  native('selection.lineEnd', '현재 줄 끝까지 선택', '기본 선택', lineEdge('End', 'ArrowRight', true)),
  native('selection.wordPrevious', '이전 단어까지 선택', '기본 선택', word('ArrowLeft', true)),
  native('selection.wordNext', '다음 단어까지 선택', '기본 선택', word('ArrowRight', true)),
  native('selection.paragraphPrevious', '이전 문단까지 선택', '기본 선택', [key('ArrowUp', { ctrl: true, shift: true })]),
  native('selection.paragraphNext', '다음 문단까지 선택', '기본 선택', [key('ArrowDown', { ctrl: true, shift: true })]),
  native('selection.documentStart', '문서 처음까지 선택', '기본 선택', documentEdge('Home', 'ArrowUp', true)),
  native('selection.documentEnd', '문서 끝까지 선택', '기본 선택', documentEdge('End', 'ArrowDown', true)),
  native('selection.screenPrevious', '이전 화면까지 선택', '기본 선택', [key('PageUp', { shift: true })]),
  native('selection.screenNext', '다음 화면까지 선택', '기본 선택', [key('PageDown', { shift: true })]),

  native('text.backspace', '앞 글자 또는 선택 영역 삭제', '기본 입력 · 삭제', [key('Backspace')]),
  native('text.delete', '뒤 글자 또는 선택 영역 삭제', '기본 입력 · 삭제', [key('Delete')]),
  native('text.wordBackspace', '이전 단어 삭제', '기본 입력 · 삭제', word('Backspace')),
  native('text.wordDelete', '다음 단어 삭제', '기본 입력 · 삭제', word('Delete'), { note: 'Mac의 Option+Delete는 본문에서 단어를 삭제합니다. 표에서는 편집기의 표 명령을 유지합니다.' }),
  native('text.lineBackspace', '현재 줄 처음까지 삭제', '기본 입력 · 삭제', [key('Backspace', { meta: true, platform: 'mac' })]),
  native('text.paragraphBreak', '새 문단 입력', '기본 입력 · 삭제', [key('Enter')]),
  native('text.lineBreak', '문단 안에서 줄 바꾸기', '기본 입력 · 삭제', [key('Enter', { shift: true })]),
  native('text.tab', '탭 입력 · 표의 다음 셀', '기본 입력 · 삭제', [key('Tab')], { note: '표의 마지막 셀에서는 편집기의 기본 동작에 따라 새 행이 추가됩니다.' }),
  native('text.shiftTab', '표의 이전 셀 · 본문 내어쓰기', '기본 입력 · 삭제', [key('Tab', { shift: true })]),
  native('text.insertMode', '삽입 · 덮어쓰기 전환', '기본 입력 · 삭제', [key('Insert')]),
]);
