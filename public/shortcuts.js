import { KEYMAP, matchKeymap, keyLabels } from './KEYMAP.js';

// State and app operations stay owned by app.js. The registry resolves only known commands.
export function createShortcuts({ getState, getEditor, isFullscreen, leaveFullscreen, onError, onStatus }) {
  const $ = id => document.getElementById(id);
  const dialog = $('shortcuts-dialog');
  let invoker = null, restoreFocus = true;
  const frame = () => getEditor()?.element;
  const automation = () => frame()?.contentWindow?.rhwpStudio?.automation;
  const input = () => frame()?.contentDocument?.querySelector('textarea[aria-label="문서 편집 입력"]');
  const click = id => { const button = $(id); if (button && !button.disabled) button.click(); };
  const editorCommand = entry => {
    const api = automation();
    if (!api?.isEnabled(entry.command)) return;
    input()?.focus({ preventScroll: true });
    const result = api.execute(entry.command, undefined, { allowDialog: Boolean(entry.dialog) });
    if (result?.ok === false && result.reason !== 'disabled') throw new Error(result.message || '편집 명령을 실행하지 못했습니다.');
  };
  const documentZoom = (command, reader) => getState().editing ? editorCommand({ command }) : reader();
  const page = value => { $('page-input').value = String(value); $('page-input').dispatchEvent(new Event('change')); };
  const handlers = {
    open: () => click('open-file'), download: () => click('download-hwp'), local: () => click('save-local'),
    original: () => click('download-original'), close: () => click('close-document'), edit: () => click('edit-document'),
    fullscreen: () => click('toggle-fullscreen'), text: () => click('toggle-text'),
    zoomIn: () => documentZoom('view:zoom-in', () => click('zoom-in')),
    zoomOut: () => documentZoom('view:zoom-out', () => click('zoom-out')),
    actualSize: () => documentZoom('view:zoom-100', () => {
      // The host owns the zoom value; its explicit event also supports menu/touch actions.
      window.dispatchEvent(new CustomEvent('hangeuldam:readerzoom', { detail: 1 }));
    }),
    fit: () => documentZoom('view:zoom-fit-width', () => click('fit-page')),
    previous: () => click('prev-page'), next: () => click('next-page'), first: () => page(1),
    last: () => page(Number($('page-input').max)), help: () => show(), editorCommand,
  };

  function enabled(entry) {
    const state = getState();
    if (entry.id === 'help.shortcuts') return true;
    if (entry.id === 'file.open') return !state.operationLocked;
    if (state.busy || !state.current) return false;
    if (entry.scope === 'reader' && state.editing) return false;
    if (entry.scope === 'editor') return state.editing && Boolean(automation()?.isEnabled(entry.command));
    if (entry.id === 'page.previous') return !$('prev-page').disabled;
    if (entry.id === 'page.next') return !$('next-page').disabled;
    return true;
  }

  function execute(entry) {
    if (!enabled(entry)) return false;
    try { handlers[entry.handler](entry); return true; }
    catch (error) { onError(error.message); return false; }
  }

  function renderHelp() {
    const list = dialog.querySelector('.shortcuts-list');
    list.replaceChildren();
    let previousGroup;
    for (const entry of KEYMAP) {
      if (entry.group !== previousGroup) {
        const group = document.createElement('div'); group.className = 'shortcut-group';
        const title = document.createElement('dt'); title.textContent = entry.group;
        group.append(title); list.append(group); previousGroup = entry.group;
      }
      const row = document.createElement('div'); row.dataset.command = entry.id;
      const term = document.createElement('dt'); term.textContent = entry.label;
      const description = document.createElement('dd');
      const bindings = document.createElement('span'); bindings.className = 'shortcut-bindings';
      // Equivalent numpad/plus bindings need not duplicate the same help label.
      const displayed = new Set();
      for (const binding of entry.keys) {
        const tokens = keyLabels(binding), text = tokens.join('+');
        if (displayed.has(text)) continue;
        if (displayed.size) bindings.append(document.createTextNode(' / '));
        displayed.add(text);
        const chord = document.createElement('span'); chord.className = 'shortcut-chord';
        tokens.forEach((token, index) => {
          if (index) chord.append(document.createTextNode(' + '));
          const key = document.createElement('kbd'); key.textContent = token; chord.append(key);
        });
        bindings.append(chord);
      }
      const run = document.createElement('button'); run.type = 'button'; run.className = 'shortcut-run';
      run.textContent = '실행'; run.setAttribute('aria-label', `${entry.label} 실행`); run.disabled = !enabled(entry);
      if (entry.id === 'help.shortcuts' || entry.nativeKeyboard) run.hidden = true;
      run.addEventListener('click', () => {
        // Close and remove inert synchronously to preserve the user's clipboard/file-picker gesture.
        restoreFocus = false; dialog.close(); $('editor-host').inert = getState().busy;
        execute(entry);
      });
      description.append(bindings, run);
      if (entry.nativeKeyboard) { const note = document.createElement('small'); note.textContent = '키보드 또는 브라우저 메뉴 사용'; description.append(note); }
      row.append(term, description); list.append(row);
    }
  }

  function show(event) {
    invoker = event?.currentTarget?.focus ? event.currentTarget : document.activeElement;
    restoreFocus = true; renderHelp();
    if (!dialog.open) dialog.showModal();
    $('editor-host').inert = true;
  }
  $('shortcuts-button').onclick = show;
  $('document-shortcuts').onclick = show;
  $('close-shortcuts').onclick = () => dialog.close();
  dialog.addEventListener('cancel', event => { event.preventDefault(); dialog.close(); });
  dialog.addEventListener('close', () => {
    $('editor-host').inert = getState().busy;
    if (restoreFocus && invoker?.isConnected) invoker.focus({ preventScroll: true });
  });
  $('shortcuts-intro').textContent = `${KEYMAP.length}개 명령 · PC·모바일·태블릿 모두 같은 단축키를 사용합니다. Ctrl 또는 ⌘ Command를 누르세요. 키보드가 없으면 ‘실행’을 눌러 사용할 수 있습니다.`;
  dialog.querySelector('.shortcuts-note').textContent = '편집 명령은 편집 영역에 커서를 둔 상태에서 사용합니다. 회색 실행 버튼은 현재 상태에서 사용할 수 없는 명령입니다. 복사·잘라내기·붙여넣기는 키보드 또는 브라우저 메뉴를 사용하며 클립보드 권한이 필요할 수 있습니다. 한글 조합 중에는 단축키를 실행하지 않습니다. Esc는 열린 대화상자를 먼저 닫고, 다음에 전체화면을 종료합니다.';

  function handle(event) {
    if (event.isComposing || event.keyCode === 229 || event.getModifierState?.('AltGraph')) return false;
    const entry = matchKeymap(event);
    const consume = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (dialog.open) {
      if ((entry && !entry.nativeKeyboard && entry.id !== 'edit.selectAll') || event.key === 'Escape') { consume(); if (event.key === 'Escape') dialog.close(); }
      return true;
    }
    const source = event.target?.ownerDocument || document;
    const fromEditor = source === frame()?.contentDocument;
    if (fromEditor && source.querySelector('.modal-overlay, .cp-overlay, .find-dialog')) {
      // Keep typing, clipboard, and Escape inside the editor's active dialog.
      if (entry && entry.scope !== 'editor') { consume(); return true; }
      return false;
    }
    if (event.key === 'Escape') {
      if (isFullscreen()) { consume(); void leaveFullscreen(); return true; }
      if (getState().busy) { consume(); click('cancel-load'); return true; }
      return false;
    }
    if (!entry) return false;
    const target = event.target;
    const typing = target?.isContentEditable || target?.matches?.('input,textarea,select');
    const editorInput = fromEditor && target === input();
    if (entry.scope === 'reader' && (typing || getState().editing)) return false;
    if (entry.scope === 'editor' && (!fromEditor || !getState().editing || (typing && !editorInput))) return false;
    if (entry.nativeKeyboard) return false;
    consume();
    if (!event.repeat) execute(entry);
    return true;
  }
  window.addEventListener('keydown', handle, true);
  return {
    bindEditor(element) {
      // Window capture precedes Studio's document listener; one command runs exactly once.
      element.contentWindow.addEventListener('keydown', handle, true);
    },
    show,
    execute(id) { const entry = KEYMAP.find(item => item.id === id); return entry ? execute(entry) : false; },
  };
}
