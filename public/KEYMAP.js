import { EDITING_KEYMAP } from './editing-keys.js';

// A single map for keyboard bindings, help, and touch actions. No device-specific keys.
// Mod means Ctrl or Command. Use physical codes so Korean layouts work as well.
// handler names resolve only through the local action registry in shortcuts.js.
const key = (code, modifiers = {}) => ({ code, ...modifiers });
const mod = (code, modifiers = {}) => key(code, { mod: true, ...modifiers });
const alt = (code, modifiers = {}) => key(code, { alt: true, ...modifiers });
const host = (id, label, group, scope, handler, keys, extra = {}) => ({ id, label, group, scope, handler, keys, ...extra });
const editor = (id, label, group, command, keys, extra = {}) => host(id, label, group, 'editor', 'editorCommand', keys, { command, ...extra });

export const KEYMAP = Object.freeze([
  host('file.open', '파일 열기', '파일', 'global', 'open', [mod('KeyO')]),
  host('file.download', 'HWP 파일 다운로드', '파일', 'document', 'download', [mod('KeyS', { shift: true })]),
  host('file.local', '이 브라우저에 기기 저장', '파일', 'document', 'local', [mod('KeyS')]),
  host('file.original', '원본 파일 다운로드', '파일', 'document', 'original', [alt('KeyO', { shift: true })]),
  host('file.close', '문서 닫기', '파일', 'document', 'close', [mod('KeyX', { shift: true })]),
  host('view.edit', '편집 · 읽기 전환', '화면', 'document', 'edit', [mod('KeyE', { shift: true })]),
  host('view.fullscreen', '전체화면 전환', '화면', 'document', 'fullscreen', [mod('KeyF', { shift: true })]),
  host('view.text', '문서 텍스트 보기', '화면', 'reader', 'text', [alt('KeyT', { shift: true })]),
  host('view.zoomIn', '문서 확대', '화면', 'document', 'zoomIn', [mod('Equal'), mod('Equal', { shift: true }), mod('NumpadAdd')]),
  host('view.zoomOut', '문서 축소', '화면', 'document', 'zoomOut', [mod('Minus'), mod('NumpadSubtract')]),
  host('view.actualSize', '문서 100% 크기', '화면', 'document', 'actualSize', [mod('Digit0')]),
  host('view.fit', '문서 너비 맞춤', '화면', 'document', 'fit', [alt('KeyF', { shift: true })]),
  host('help.shortcuts', '단축키 도움말', '화면', 'global', 'help', [key('F1'), mod('Slash')]),
  host('page.previous', '이전 쪽', '쪽 이동 · 읽기', 'reader', 'previous', [key('PageUp')]),
  host('page.next', '다음 쪽', '쪽 이동 · 읽기', 'reader', 'next', [key('PageDown')]),
  host('page.first', '첫 쪽', '쪽 이동 · 읽기', 'reader', 'first', [mod('Home')]),
  host('page.last', '마지막 쪽', '쪽 이동 · 읽기', 'reader', 'last', [mod('End')]),
  editor('edit.undo', '실행 취소', '편집', 'edit:undo', [mod('KeyZ')]),
  editor('edit.redo', '다시 실행', '편집', 'edit:redo', [mod('KeyZ', { shift: true }), mod('KeyY')]),
  editor('edit.selectAll', '문서 전체 선택', '편집', 'edit:select-all', [mod('KeyA')]),
  // Keep trusted clipboard events in Studio. Browsers can reject scripted paste even on a tap.
  editor('edit.copy', '복사', '편집', 'edit:copy', [mod('KeyC')], { nativeKeyboard: true }),
  editor('edit.cut', '잘라내기', '편집', 'edit:cut', [mod('KeyX')], { nativeKeyboard: true }),
  editor('edit.paste', '붙여넣기', '편집', 'edit:paste', [mod('KeyV')], { nativeKeyboard: true }),
  editor('edit.find', '문서에서 찾기', '찾기', 'edit:find', [mod('KeyF')], { dialog: true }),
  editor('edit.replace', '찾아 바꾸기', '찾기', 'edit:find-replace', [mod('F2')], { dialog: true }),
  editor('edit.findNext', '다음 검색 결과', '찾기', 'edit:find-again', [key('F3')]),
  editor('format.bold', '굵게', '글자 서식', 'format:bold', [mod('KeyB')]),
  editor('format.italic', '기울임', '글자 서식', 'format:italic', [mod('KeyI')]),
  editor('format.underline', '밑줄', '글자 서식', 'format:underline', [mod('KeyU')]),
  editor('format.strike', '취소선', '글자 서식', 'format:strikethrough', [alt('KeyS', { shift: true })]),
  editor('format.larger', '글자 크기 키우기', '글자 서식', 'format:font-size-increase', [mod('BracketRight')]),
  editor('format.smaller', '글자 크기 줄이기', '글자 서식', 'format:font-size-decrease', [mod('BracketLeft')]),
  editor('format.character', '글자 모양', '글자 서식', 'format:char-shape', [alt('KeyL')], { dialog: true }),
  editor('format.left', '왼쪽 정렬', '문단 서식', 'format:align-left', [mod('KeyL', { shift: true })]),
  editor('format.center', '가운데 정렬', '문단 서식', 'format:align-center', [alt('KeyC', { shift: true })]),
  editor('format.right', '오른쪽 정렬', '문단 서식', 'format:align-right', [alt('KeyH', { shift: true })]),
  editor('format.justify', '양쪽 정렬', '문단 서식', 'format:align-justify', [mod('KeyM', { shift: true })]),
  editor('format.paragraph', '문단 모양', '문단 서식', 'format:para-shape', [alt('KeyT')], { dialog: true }),
  editor('format.lineIncrease', '줄 간격 늘리기', '문단 서식', 'format:line-spacing-increase', [alt('KeyZ', { shift: true })]),
  editor('format.lineDecrease', '줄 간격 줄이기', '문단 서식', 'format:line-spacing-decrease', [alt('KeyA', { shift: true })]),
  editor('page.break', '쪽 나누기', '문단 서식', 'page:break', [mod('Enter')]),
  ...EDITING_KEYMAP,
]);

const codeLabels = { Equal: '+', Minus: '−', NumpadAdd: '+', NumpadSubtract: '−', Digit0: '0', BracketRight: ']', BracketLeft: '[', Slash: '/', PageUp: 'Page Up', PageDown: 'Page Down', Enter: 'Enter', Home: 'Home', End: 'End', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backspace: 'Backspace', Delete: 'Delete', Tab: 'Tab', Insert: 'Insert' };
const koreanCodes = { 'ㅐ': 'KeyO', 'ㄴ': 'KeyS', 'ㅌ': 'KeyX', 'ㄷ': 'KeyE', 'ㄹ': 'KeyF', 'ㅅ': 'KeyT', 'ㅋ': 'KeyZ', 'ㅛ': 'KeyY', 'ㅁ': 'KeyA', 'ㅊ': 'KeyC', 'ㅠ': 'KeyB', 'ㅑ': 'KeyI', 'ㅕ': 'KeyU', 'ㅣ': 'KeyL', 'ㅗ': 'KeyH', 'ㅡ': 'KeyM' };
function codeFor(event) {
  if (event.code) return event.code;
  const value = String(event.key || '').toLowerCase();
  if (/^[a-z]$/.test(value)) return `Key${value.toUpperCase()}`;
  return koreanCodes[value] || { '+': 'Equal', '=': 'Equal', '-': 'Minus', '0': 'Digit0', '[': 'BracketLeft', ']': 'BracketRight', '/': 'Slash', pageup: 'PageUp', pagedown: 'PageDown', home: 'Home', end: 'End', enter: 'Enter', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', backspace: 'Backspace', delete: 'Delete', tab: 'Tab', insert: 'Insert', f1: 'F1', f2: 'F2', f3: 'F3' }[value] || event.key;
}

function bindingMatches(binding, event, code) {
  const mac = /Mac|iPhone|iPad|iPod/i.test(globalThis.navigator?.platform || '') || /Macintosh|iPhone|iPad|iPod/i.test(globalThis.navigator?.userAgent || '');
  if (binding.platform === 'mac' && !mac || binding.platform === 'other' && mac) return false;
  const primary = binding.mod ? Boolean(event.ctrlKey || event.metaKey)
    : Boolean(binding.ctrl) === Boolean(event.ctrlKey) && Boolean(binding.meta) === Boolean(event.metaKey);
  return binding.code === code && primary && Boolean(binding.shift) === Boolean(event.shiftKey) && Boolean(binding.alt) === Boolean(event.altKey);
}

export function matchKeymap(event, accepts = () => true) {
  if (event.isComposing || event.keyCode === 229 || event.getModifierState?.('AltGraph')) return null;
  const code = codeFor(event);
  return KEYMAP.find(entry => accepts(entry) && entry.keys.some(binding => bindingMatches(binding, event, code))) || null;
}

export function keyLabels(binding) {
  return [binding.mod && 'Ctrl / ⌘', binding.ctrl && 'Ctrl', binding.meta && '⌘', binding.alt && (binding.platform === 'mac' ? '⌥ Option' : 'Alt / ⌥'), binding.shift && 'Shift', codeLabels[binding.code] || binding.code.replace(/^Key/, '')].filter(Boolean);
}
