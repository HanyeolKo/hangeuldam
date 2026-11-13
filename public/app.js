// 본 제품은 한글과컴퓨터의 한글 문서 파일(.hwp) 공개 문서를 참고하여 개발하였습니다.
import DOMPurify from './vendor/purify.es.mjs';
import { createEditor } from './vendor/editor-sdk/index.js';
import { configureEditorDevice } from './device.js';

const $ = (id) => document.getElementById(id);
const MAX_SIZE = 50 * 1024 * 1024;
let worker, sequence = 0, current = null, zoom = 1, naturalWidth = 794;
let generation = 0, busy = false, dbPromise, registration;
let editor = null, editing = false, dirtyTimer = null, checkingDirty = false;
let preparingOffline = false, operationLocked = false, fullscreenPending = false, fallbackExpanded = false;
const pending = new Map();
const status = (text) => { $('status').textContent = text; $('fullscreen-status').textContent = text; };
const error = (text) => { $('error-message').textContent = text; $('error-banner').hidden = false; };
const readableSize = (size) => size < 1024 * 1024 ? `${(size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

function setBusy(value, text = '문서를 읽고 있습니다…', lock = Boolean(editor)) {
  busy = value;
  operationLocked = value && lock;
  $('busy-overlay').hidden = !value;
  $('busy-label').textContent = text;
  $('editor-host').inert = value || $('shortcuts-dialog').open;
  $('close-document').disabled = value;
  $('open-file').disabled = operationLocked;
  $('cancel-load').hidden = operationLocked;
  for (const id of ['prev-page', 'next-page', 'page-input', 'toggle-text', 'save-local', 'download-original', 'download-hwp', 'edit-document']) $(id).disabled = value || !current;
  if (current && !value) {
    $('prev-page').disabled = current.page === 0;
    $('next-page').disabled = current.page === current.pages - 1;
  }
  syncFullscreen();
}

function supportsFullscreen() {
  return Boolean(document.fullscreenEnabled && $('drop-zone').requestFullscreen && document.exitFullscreen);
}
function isDocumentFullscreen() { return document.fullscreenElement === $('drop-zone') || fallbackExpanded; }

function syncFullscreen() {
  const supported = supportsFullscreen();
  const active = isDocumentFullscreen();
  const label = active ? (fallbackExpanded ? '화면 확대 종료' : '전체화면 나가기') : (supported ? '전체화면' : '화면 확대');
  const button = $('toggle-fullscreen');
  button.disabled = fullscreenPending || (!active && (!current || busy));
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', label);
  button.title = active ? `${label} (Esc)` : label;
  $('fullscreen-label').textContent = label;
  $('fullscreen-icon').setAttribute('href', active ? '#i-fullscreen-exit' : '#i-fullscreen');
  $('fullscreen-support').hidden = supported;
}

function refitExpandedPage() {
  requestAnimationFrame(() => {
    if (current && !editing && $('text-panel').hidden) fitPage();
  });
}

function setFallbackExpanded(value) {
  fallbackExpanded = value;
  $('drop-zone').classList.toggle('is-expanded', value);
  document.body.classList.toggle('document-expanded', value);
  syncFullscreen();
  refitExpandedPage();
}

async function leaveDocumentFullscreen() {
  if (fallbackExpanded) { setFallbackExpanded(false); return true; }
  if (!isDocumentFullscreen()) return true;
  try { await document.exitFullscreen(); return true; }
  catch { error('전체화면을 나가지 못했습니다. Esc를 누른 뒤 다시 시도해 주세요.'); return false; }
}

$('toggle-fullscreen').onclick = async () => {
  if (fullscreenPending || (!isDocumentFullscreen() && (!current || busy))) return;
  fullscreenPending = true;
  syncFullscreen();
  try {
    if (isDocumentFullscreen()) await leaveDocumentFullscreen();
    else if (supportsFullscreen()) await $('drop-zone').requestFullscreen();
    else setFallbackExpanded(true);
  } catch { error('전체화면으로 전환하지 못했습니다. 브라우저 설정을 확인하거나 다시 시도해 주세요.'); }
  finally { fullscreenPending = false; syncFullscreen(); }
};

document.addEventListener('fullscreenchange', () => { syncFullscreen(); refitExpandedPage(); });
window.addEventListener('resize', () => {
  if (isDocumentFullscreen() && current && !editing && $('text-panel').hidden) fitPage();
});

function handleFullscreenEscape(event) {
  if (event.key !== 'Escape' || !isDocumentFullscreen()) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  void leaveDocumentFullscreen();
  return true;
}

function stopWorker() {
  worker?.terminate();
  worker = null;
  for (const { reject, timer } of pending.values()) {
    clearTimeout(timer);
    reject(new Error('작업이 취소되었습니다.'));
  }
  pending.clear();
}

function createWorker() {
  stopWorker();
  worker = new Worker(new URL('./reader.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const entry = pending.get(data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pending.delete(data.id);
    data.error ? entry.reject(new Error(data.error)) : entry.resolve(data.result);
  };
  worker.onerror = (event) => {
    event.preventDefault();
    stopWorker();
    error('문서 엔진을 실행하지 못했습니다. 최신 Chrome, Edge 또는 Firefox에서 다시 시도해 주세요.');
  };
}

function request(type, data = {}, transfer = []) {
  if (!worker) return Promise.reject(new Error('문서 엔진을 다시 시작해야 합니다. 문서를 다시 열어 주세요.'));
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('처리 시간이 60초를 초과했습니다. 문서를 닫고 더 작은 파일로 시도해 주세요.'));
      stopWorker();
    }, 60000);
    pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, type, ...data }, transfer);
  });
}

function renderSvg(source) {
  // Only SVG graphics enter the DOM. Links, active content and remote resources are removed.
  const fragment = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true }, RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['style', 'foreignObject', 'a', 'animate', 'animateMotion', 'animateTransform', 'set'],
    FORBID_ATTR: ['style'],
  });
  for (const element of fragment.querySelectorAll('*')) {
    if (element.hasAttribute('font-family')) {
      element.setAttribute('font-family', element.getAttribute('font-family').replace(/\bsans-serif\b/g, '"Nanum Gothic", sans-serif').replace(/(?<!sans-)\bserif\b/g, '"Nanum Myeongjo", serif'));
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase(), value = attribute.value.trim();
      if (name === 'href' || name === 'xlink:href') {
        if (!value.startsWith('#') && !/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,/i.test(value)) element.removeAttribute(attribute.name);
      }
      // Reject CSS escapes/comments and permit only whole local paint references.
      if (value.includes('\\') || value.includes('/*') ||
          (/url\s*\(/i.test(value) && !/^url\(\s*['"]?#[\w:.-]+['"]?\s*\)$/i.test(value))) element.removeAttribute(attribute.name);
    }
  }
  const svg = fragment.querySelector('svg');
  if (!svg) throw new Error('이 쪽의 내용을 표시할 수 없습니다.');
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  naturalWidth = viewBox?.[2] || parseFloat(svg.getAttribute('width')) || 794;
  svg.style.width = '100%';
  svg.style.height = 'auto';
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `${current.name} ${current.page + 1}쪽`);
  $('page-host').replaceChildren(fragment);
  applyZoom();
}

function applyZoom() {
  $('page-host').style.width = `${naturalWidth * zoom}px`;
  $('zoom-value').textContent = `${Math.round(zoom * 100)}%`;
}

function fitPage() {
  const available = $('page-host').parentElement.clientWidth - (window.innerWidth < 700 ? 24 : 64);
  zoom = Math.min(1.5, Math.max(0.25, available / naturalWidth));
  applyZoom();
}

function resetView() {
  destroyEditor();
  current = null;
  $('empty-state').hidden = false;
  $('document-view').hidden = true;
  $('text-panel').hidden = true;
  $('toggle-text').setAttribute('aria-pressed', 'false');
  $('page-host').replaceChildren();
  $('document-text').textContent = '';
  $('doc-state').classList.remove('is-dirty');
  document.title = '한글담 — 오프라인 한글 편집기';
  setBusy(false);
}

async function openFile(file, savedId = null) {
  if (!file) return;
  if (operationLocked) return status('현재 작업이 끝난 뒤 다른 문서를 열어 주세요.');
  $('error-banner').hidden = true;
  if (!/\.(hwp|hwpx)$/i.test(file.name)) return error('HWP 또는 HWPX 파일을 선택해 주세요.');
  if (!file.size || file.size > MAX_SIZE) return error('0바이트 파일은 열 수 없습니다. 최대 50 MB까지 지원합니다.');
  if (!(await allowDiscard())) return;
  if (!(await leaveDocumentFullscreen())) return;
  const token = ++generation;
  stopWorker();
  resetView();
  setBusy(true, '문서와 글꼴을 불러오고 있습니다…');
  try {
    const buffer = await file.arrayBuffer();
    if (token !== generation) return;
    const sig = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
    const cfb = [208, 207, 17, 224, 161, 177, 26, 225].every((b, i) => sig[i] === b);
    const zip = sig[0] === 80 && sig[1] === 75 && sig[2] === 3 && sig[3] === 4;
    if (!cfb && !zip) throw new Error('HWP 5 또는 HWPX 형식이 아닙니다. 오래된 HWP 3 파일은 한글에서 다시 저장해 주세요.');
    await Promise.all(['Nanum Gothic', '나눔고딕', 'Nanum Myeongjo', '나눔명조'].map(name => document.fonts.load(`12px "${name}"`)));
    if (token !== generation) return;
    createWorker();
    const result = await request('open', { buffer }, [buffer]);
    if (token !== generation) return;
    current = { name: file.name, file, originalFile: file, pages: result.pages, page: 0, savedId, dirty: false };
    $('empty-state').hidden = true;
    $('document-view').hidden = false;
    $('doc-name').textContent = file.name;
    $('doc-meta').textContent = `${readableSize(file.size)} · ${result.pages}쪽 · 내 기기에서 처리`;
    $('doc-state').textContent = '읽기 모드';
    $('page-total').textContent = String(result.pages);
    $('page-input').max = String(result.pages);
    $('page-input').value = '1';
    $('save-local').textContent = savedId ? '기기에 저장됨' : '기기에 저장';
    document.title = `${file.name} — 한글담`;
    renderSvg(result.svg);
    fitPage();
    status(`${file.name} · 문서를 열었습니다. 파일은 서버로 전송되지 않았습니다.`);
  } catch (e) {
    if (token !== generation) return;
    stopWorker();
    resetView();
    error(`문서를 열지 못했습니다. 암호·손상·지원하지 않는 문서인지 확인해 주세요. ${e.message}`);
    status('문서를 열지 못했습니다. 다른 파일을 선택할 수 있습니다.');
  } finally {
    if (token === generation) setBusy(false);
  }
}

async function showPage(index) {
  if (!current || busy || !Number.isInteger(index)) return;
  index = Math.max(0, Math.min(current.pages - 1, index));
  const token = generation;
  setBusy(true, `${index + 1}쪽을 표시하고 있습니다…`);
  try {
    const result = await request('page', { page: index });
    if (token !== generation) return;
    current.page = index;
    renderSvg(result.svg);
    $('page-input').value = String(index + 1);
    status(`${current.name} · ${index + 1} / ${current.pages}쪽`);
  } catch (e) {
    if (token === generation) error(e.message);
  } finally { if (token === generation) setBusy(false); }
}

function database() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const opening = indexedDB.open('hangeuldam-documents-v1', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('documents', { keyPath: 'id' });
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error('다른 탭을 닫고 다시 시도해 주세요.'));
  }).catch((e) => { dbPromise = null; throw e; });
  return dbPromise;
}

async function stored(operation, mode = 'readonly') {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', mode);
    const request = operation(tx.objectStore('documents'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('저장이 취소되었습니다.'));
  });
}

async function refreshSaved() {
  try {
    const documents = (await stored((store) => store.getAll())).sort((a, b) => b.savedAt - a.savedAt);
    $('saved-list').replaceChildren();
    $('clear-saved').disabled = !documents.length;
    $('clear-saved').hidden = !documents.length;
    if (!documents.length) {
      const empty = document.createElement('p');
      empty.className = 'saved-empty';
      empty.textContent = '아직 저장한 문서가 없습니다. 문서를 연 뒤 기기에 저장해 보세요.';
      $('saved-list').append(empty);
    }
    for (const saved of documents) {
      const row = document.createElement('div'); row.className = 'saved-item';
      const button = document.createElement('button'); button.className = 'saved-open';
      const title = document.createElement('strong'); title.textContent = saved.name;
      const meta = document.createElement('small'); meta.textContent = `${readableSize(saved.blob.size)} · ${new Date(saved.savedAt).toLocaleDateString('ko-KR')}`;
      button.append(title, meta);
      button.onclick = () => openFile(new File([saved.blob], saved.name, { lastModified: saved.modified }), saved.id);
      const remove = document.createElement('button'); remove.className = 'saved-remove'; remove.textContent = '×';
      remove.setAttribute('aria-label', `${saved.name} 기기 저장 삭제`);
      remove.onclick = async () => {
        if (!confirm(`기기에 저장한 “${saved.name}” 사본을 삭제할까요? 원본 파일은 유지됩니다.`)) return;
        try {
          await stored((store) => store.delete(saved.id), 'readwrite');
          if (current?.savedId === saved.id) { current.savedId = null; $('save-local').textContent = '기기에 저장'; }
          await refreshSaved();
        } catch { error('저장된 사본을 삭제하지 못했습니다.'); }
      };
      row.append(button, remove); $('saved-list').append(row);
    }
  } catch { $('saved-list').textContent = '이 브라우저에서는 기기 저장소를 사용할 수 없습니다.'; }
}

$('save-local').onclick = async () => {
  if (!current || busy) return;
  const snapshot = current;
  setBusy(true, '편집한 문서를 기기에 저장하고 있습니다…', true);
  try {
    const exported = editor ? await exportDocument() : null;
    if (editor && !exported) return;
    const file = exported ? new File([exported.bytes], hwpName(snapshot.name), { type: 'application/x-hwp' }) : snapshot.file;
    const id = snapshot.savedId || `${snapshot.name}:${snapshot.originalFile.size}:${snapshot.originalFile.lastModified}`;
    await stored((store) => store.put({ id, name: file.name, blob: file, modified: file.lastModified, savedAt: Date.now() }), 'readwrite');
    snapshot.savedId = id;
    if (exported) await markSaved(exported);
    if (current === snapshot) $('save-local').textContent = '기기에 저장됨';
    await refreshSaved();
    status('현재 문서를 이 브라우저에 저장했습니다. 서버로 전송하지 않았습니다.');
  } catch (e) { error(`기기에 저장하지 못했습니다. ${e.message}`); }
  finally { setBusy(false); }
};

$('clear-saved').onclick = async () => {
  if (!confirm('이 브라우저에 저장한 문서 사본을 모두 삭제할까요? 원본 파일은 유지됩니다.')) return;
  try {
    await stored((store) => store.clear(), 'readwrite');
    if (current) { current.savedId = null; $('save-local').textContent = '기기에 저장'; }
    await refreshSaved();
  } catch { error('저장된 사본을 삭제하지 못했습니다.'); }
};

$('download-original').onclick = () => {
  if (!current) return;
  downloadBlob(current.originalFile, current.originalFile.name);
};

$('toggle-text').onclick = async () => {
  if (!current || busy) return;
  if (!$('text-panel').hidden) { $('text-panel').hidden = true; $('toggle-text').setAttribute('aria-pressed', 'false'); if (isDocumentFullscreen()) fitPage(); return; }
  const token = generation;
  setBusy(true, '문서의 텍스트를 가져오고 있습니다…');
  try {
    const result = await request('text');
    if (token !== generation) return;
    $('document-text').textContent = result.text || '추출할 수 있는 텍스트가 없습니다. 그림으로 된 글자는 인식하지 않습니다.';
    $('text-panel').hidden = false;
    $('toggle-text').setAttribute('aria-pressed', 'true');
  } catch (e) { if (token === generation) error(e.message); }
  finally { if (token === generation) setBusy(false); }
};

const chooseFile = () => $('file-input').click();
$('open-file').onclick = chooseFile;
$('choose-file').onclick = chooseFile;
$('file-input').onchange = (event) => { const file = event.target.files[0]; event.target.value = ''; openFile(file); };
for (const name of ['dragenter', 'dragover']) document.addEventListener(name, (event) => { event.preventDefault(); $('drop-zone').classList.add('drag-over'); });
document.addEventListener('dragleave', (event) => { if (!event.relatedTarget) $('drop-zone').classList.remove('drag-over'); });
document.addEventListener('drop', (event) => { event.preventDefault(); $('drop-zone').classList.remove('drag-over'); openFile(event.dataTransfer.files[0]); });
$('sample-button').onclick = async () => {
  const token = generation;
  try {
    const response = await fetch('./sample.hwp');
    if (!response.ok) throw new Error();
    const blob = await response.blob();
    if (token !== generation) return;
    await openFile(new File([blob], '한글담 시작하기.hwp', { lastModified: 0 }));
  } catch { if (token === generation) error('예제 문서를 불러오지 못했습니다.'); }
};
$('prev-page').onclick = () => showPage(current.page - 1);
$('next-page').onclick = () => showPage(current.page + 1);
$('page-input').onchange = () => { const value = Number($('page-input').value); if (Number.isInteger(value)) showPage(value - 1); else $('page-input').value = String(current.page + 1); };
$('zoom-in').onclick = () => { zoom = Math.min(2.5, zoom + 0.1); applyZoom(); };
$('zoom-out').onclick = () => { zoom = Math.max(0.25, zoom - 0.1); applyZoom(); };
$('fit-page').onclick = fitPage;
$('dismiss-error').onclick = () => { $('error-banner').hidden = true; };
const closeDocument = async () => { if (operationLocked) return; if (!(await allowDiscard())) return; if (!(await leaveDocumentFullscreen())) return; generation++; stopWorker(); resetView(); status('문서를 닫았습니다.'); };
$('close-document').onclick = closeDocument;
$('cancel-load').onclick = async () => {
  if (operationLocked) return;
  if (editor) { status('편집 문서 저장이 끝날 때까지 기다려 주세요.'); return; }
  await closeDocument(); status('문서 처리를 취소했습니다.');
};
let shortcutInvoker = null;
function showShortcuts(event) {
  shortcutInvoker = event.currentTarget;
  if (!$('shortcuts-dialog').open) $('shortcuts-dialog').showModal();
  $('editor-host').inert = true;
}
$('shortcuts-button').onclick = showShortcuts;
$('document-shortcuts').onclick = showShortcuts;
$('close-shortcuts').onclick = () => $('shortcuts-dialog').close();
$('shortcuts-dialog').addEventListener('cancel', event => { event.preventDefault(); $('shortcuts-dialog').close(); });
$('shortcuts-dialog').addEventListener('close', () => {
  $('editor-host').inert = busy;
  if (shortcutInvoker?.isConnected) shortcutInvoker.focus({ preventScroll: true });
});

function hostShortcut(event) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (!event.shiftKey && (event.code === 'KeyO' || key === 'o' || key === 'ㅐ')) return 'open';
  if (event.code === 'KeyS' || key === 's' || key === 'ㄴ') return event.shiftKey ? 'local' : 'download';
  return null;
}

function handleHostKeys(event) {
  // Do not turn an IME composition key into a file action or a fullscreen exit.
  if (event.isComposing || event.keyCode === 229) return false;
  const action = hostShortcut(event);
  if ($('shortcuts-dialog').open) {
    if (event.key === 'Escape' || action) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') $('shortcuts-dialog').close();
    }
    return true;
  }
  // Let an editor dialog consume Escape before leaving the document's fullscreen view.
  const sourceDocument = event.currentTarget;
  if (sourceDocument !== document && sourceDocument.querySelector('.modal-overlay, .cp-overlay')) {
    if (action) { event.preventDefault(); event.stopImmediatePropagation(); return true; }
    return false;
  }
  if (action) {
    // Studio marks embedded save keys prevented before this listener; still consume them here.
    event.preventDefault(); event.stopImmediatePropagation();
    if (!event.repeat) {
      if (action === 'open' && !operationLocked) chooseFile();
      if (action === 'download' && !busy) $('download-hwp').click();
      if (action === 'local' && !busy) $('save-local').click();
    }
    return true;
  }
  return handleFullscreenEscape(event);
}

document.addEventListener('keydown', event => {
  if (handleHostKeys(event)) return;
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape' && busy) $('cancel-load').click();
  if (current && !busy && !['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) && !event.target.isContentEditable) {
    if (event.key === 'PageDown') { event.preventDefault(); showPage(current.page + 1); }
    if (event.key === 'PageUp') { event.preventDefault(); showPage(current.page - 1); }
  }
}, true);

async function offlineState() {
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    $('offline-status').textContent = '오프라인 준비는 보안 연결(HTTPS) 또는 localhost에서 가능합니다. 내려받은 실행 폴더도 사용할 수 있습니다.';
    $('offline-button').disabled = true;
    return;
  }
  try {
    registration = await navigator.serviceWorker.getRegistration(new URL('./', location.href));
    if (registration?.active) {
      const channel = new MessageChannel();
      const response = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 5000);
        channel.port1.onmessage = ({ data }) => { clearTimeout(timer); resolve(data.ready && data.features?.includes('device-ui-v3')); };
        registration.active.postMessage({ type: 'STATUS' }, [channel.port2]);
      });
      if (response) {
        $('offline-status').textContent = navigator.onLine ? '오프라인 준비 완료 · 인터넷 없이 문서를 열 수 있습니다.' : '오프라인 사용 중 · 저장한 문서와 새 파일을 열 수 있습니다.';
        $('offline-button').textContent = '오프라인 준비 다시 확인';
        return true;
      }
    }
    $('offline-status').textContent = '편집기와 한글 글꼴을 기기에 저장합니다. 준비를 마치면 오프라인에서도 편집·HWP 저장이 가능합니다.';
  } catch { $('offline-status').textContent = '오프라인 준비 상태를 확인하지 못했습니다. 다시 시도해 주세요.'; }
}

$('offline-button').onclick = async () => {
  preparingOffline = true;
  $('offline-button').disabled = true;
  $('offline-status').textContent = '앱과 한글 글꼴을 저장하고 있습니다. 잠시만 기다려 주세요…';
  try {
    if (!navigator.onLine) {
      if (await offlineState()) return;
      throw new Error('처음 준비할 때는 인터넷 연결이 필요합니다.');
    }
    registration = await navigator.serviceWorker.register('./sw.js', { scope: './', updateViaCache: 'none' });
    await registration.update();
    const installing = registration.installing || registration.waiting;
    if (installing && installing.state !== 'activated') await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('다운로드 시간을 초과했습니다. 네트워크 연결을 확인해 주세요.')), 120000);
      const changed = () => {
        if (installing.state === 'activated') { clearTimeout(timeout); resolve(); }
        if (installing.state === 'redundant') { clearTimeout(timeout); reject(new Error('앱 다운로드에 실패했습니다. 저장 공간과 네트워크 연결을 확인해 주세요.')); }
      };
      installing.addEventListener('statechange', changed); changed();
    });
    // On an already installed version, repair any entries evicted by the browser.
    if (registration.active) await new Promise((resolve, reject) => {
      const channel = new MessageChannel();
      const timeout = setTimeout(() => reject(new Error('앱 저장 확인 시간을 초과했습니다.')), 120000);
      channel.port1.onmessage = ({ data }) => { clearTimeout(timeout); data.error ? reject(new Error(data.error)) : resolve(); };
      registration.active.postMessage({ type: 'PREPARE' }, [channel.port2]);
    });
    if (navigator.storage?.persist) await navigator.storage.persist();
    await offlineState();
  } catch (e) { $('offline-status').textContent = `오프라인 준비 실패: ${e.message}`; }
  finally { preparingOffline = false; $('offline-button').disabled = false; }
};
if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ({ data }) => {
  if (preparingOffline && data?.type === 'HANGEULDAM_CACHE_PROGRESS') $('offline-status').textContent = `오프라인 편집기 저장 중 · ${data.complete} / ${data.total}개 파일`;
});
window.addEventListener('online', offlineState);
window.addEventListener('offline', offlineState);
refreshSaved(); offlineState(); resetView();

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function hwpName(name) { return name.replace(/\.(hwp|hwpx)$/i, '') + '.hwp'; }

function destroyEditor() {
  clearInterval(dirtyTimer); dirtyTimer = null;
  editor?.destroy(); editor = null; editing = false; checkingDirty = false;
  $('editor-host').replaceChildren(); $('editor-host').hidden = true;
  $('document-view').classList.remove('editing');
  document.body.classList.remove('editing-document');
  $('edit-document').textContent = '편집하기';
  $('edit-document').setAttribute('aria-pressed', 'false');
}

async function updateDirty() {
  if (!editor || checkingDirty) return;
  const active = editor, snapshot = current;
  checkingDirty = true;
  try {
    const state = active.element.contentWindow.rhwpStudio?.hangeuldam?.state();
    const dirty = state ? state.dirty : (await active.commands.context()).isDirty;
    if (editor !== active || current !== snapshot) return;
    snapshot.dirty = Boolean(dirty);
    $('doc-state').textContent = dirty ? '저장하지 않은 변경사항' : (editing ? '편집 모드' : '읽기 모드');
    $('doc-state').classList.toggle('is-dirty', Boolean(dirty));
    if (dirty) $('save-local').textContent = '기기에 저장';
  } catch { /* Keep the last known dirty state if the iframe is unavailable. */ }
  finally { checkingDirty = false; }
}

async function allowDiscard() {
  if (!editor) return true;
  // Read synchronously through the same-origin adapter, not a delayed polling result.
  try {
    const state = editor.element.contentWindow.rhwpStudio?.hangeuldam?.state();
    const dirty = state ? state.dirty : (await editor.commands.context()).isDirty;
    return !dirty || confirm('저장하지 않은 편집 내용이 있습니다. 변경사항을 버리고 계속할까요?');
  } catch {
    return confirm('편집기의 저장 상태를 확인하지 못했습니다. 저장하지 않은 변경사항이 사라질 수 있습니다. 문서를 닫고 계속할까요?');
  }
}

async function startEditor(studioUrl) {
  let expired = false, timer;
  const starting = createEditor($('editor-host'), { studioUrl, renderer: 'canvas2d', requestTimeoutMs: 60000 });
  const frame = $('editor-host').lastElementChild;
  starting.then(instance => { if (expired) instance.destroy(); }, () => {});
  try {
    return await Promise.race([starting, new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true; frame?.remove();
        reject(new Error('편집기 초기화 시간이 초과되었습니다. 오프라인 준비 상태를 확인한 뒤 다시 시도해 주세요.'));
      }, 60000);
    })]);
  } finally { clearTimeout(timer); }
}

function installEditorKeys(instance) {
  instance.element.title = '한글 문서 편집 영역';
  const stylesheet = instance.element.contentDocument.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = new URL('./studio-host.css', location.href).href;
  instance.element.contentDocument.head.append(stylesheet);
  instance.element.contentDocument.addEventListener('keydown', handleHostKeys, true);
  // Hyperlinks and form actions never navigate or submit user document data.
  instance.element.contentWindow.rhwpStudio?.links?.setHandler(() => true);
  instance.element.contentWindow.rhwpStudio?.forms?.setActionsEnabled(false);
}

$('edit-document').onclick = async () => {
  if (!current || busy) return;
  const token = generation;
  setBusy(true, editing ? '편집한 문서를 미리 보고 있습니다…' : '오프라인 편집기를 불러오고 있습니다…', true);
  try {
    if (editing) {
      const exported = await exportDocument();
      if (!exported || token !== generation) return;
      if (!worker) createWorker();
      const buffer = exported.bytes.slice().buffer;
      const result = await request('open', { buffer }, [buffer]);
      current.pages = result.pages; current.page = 0;
      $('page-total').textContent = String(result.pages); $('page-input').max = String(result.pages); $('page-input').value = '1';
      renderSvg(result.svg);
      editing = false;
    } else {
      $('editor-host').hidden = false;
      if (!editor) {
        const studioUrl = new URL('./studio/index.html?chrome=embed&renderer=canvas2d', location.href).href;
        const instance = await startEditor(studioUrl);
        if (token !== generation) { instance.destroy(); return; }
        editor = instance;
        installEditorKeys(instance);
        await instance.loadFile(await current.file.arrayBuffer(), current.file.name, { suppressDialogs: true });
        configureEditorDevice(instance.element);
        dirtyTimer = setInterval(updateDirty, 800);
      }
      editing = true;
    }
    $('text-panel').hidden = true;
    $('toggle-text').setAttribute('aria-pressed', 'false');
    $('editor-host').hidden = !editing;
    $('document-view').classList.toggle('editing', editing);
    document.body.classList.toggle('editing-document', editing);
    $('edit-document').textContent = editing ? '읽기 보기' : '편집하기';
    $('edit-document').setAttribute('aria-pressed', String(editing));
    await updateDirty();
    if (!editing) fitPage();
    status(editing ? '문서를 클릭해 편집하세요. HWP 저장 또는 Ctrl+S로 내려받을 수 있습니다.' : '편집 내용이 반영된 미리보기입니다. 저장하지 않은 내용은 HWP 저장을 눌러 보관하세요.');
  } catch (e) {
    if (token !== generation) return;
    if (!editing) destroyEditor();
    error(`편집 화면을 전환하지 못했습니다. ${e.message}`);
  } finally { if (token === generation) setBusy(false); }
};

async function exportDocument() {
  let artifact;
  if (editor) {
    const api = editor.element.contentWindow.rhwpStudio?.hangeuldam;
    if (!api?.exportHwpWithReport) throw new Error('편집기 저장 모듈을 불러오지 못했습니다. 변경사항을 유지한 채 다시 시도해 주세요.');
    artifact = await api.exportHwpWithReport();
  } else if (/\.hwp$/i.test(current.file.name)) {
    artifact = { bytes: new Uint8Array(await current.file.arrayBuffer()), contentLoss: { count: 0, losses: [] } };
  } else {
    if (!worker) {
      createWorker();
      const buffer = await current.file.arrayBuffer();
      await request('open', { buffer }, [buffer]);
    }
    artifact = await request('export');
  }
  if (!artifact.bytes?.byteLength) throw new Error('저장할 HWP 데이터가 없습니다.');
  if (artifact.contentLoss?.count > 0) {
    const descriptions = artifact.contentLoss.losses.slice(0, 5).map(loss => loss.message || loss.description || loss.kind || loss.code || '일부 문서 요소').join('\n');
    if (!confirm(`HWP 저장 중 ${artifact.contentLoss.count}개 요소가 완전히 보존되지 않을 수 있습니다.\n${descriptions}\n\n원본은 유지됩니다. 계속 저장할까요?`)) return null;
  }
  if (!worker) {
    createWorker();
    const original = await current.file.arrayBuffer();
    await request('open', { buffer: original }, [original]);
  }
  const buffer = artifact.bytes.slice().buffer;
  await request('verify', { buffer }, [buffer]);
  return artifact;
}

async function markSaved(artifact) {
  if (!editor) return;
  const state = editor.element.contentWindow.rhwpStudio?.hangeuldam?.state();
  if (state && artifact.revision !== undefined && (state.revision !== artifact.revision || state.generation !== artifact.generation)) return;
  await editor.notifySaved();
  current.dirty = false;
  await updateDirty();
}

$('download-hwp').onclick = async () => {
  if (!current || busy) return;
  const snapshot = current;
  setBusy(true, 'HWP 파일을 만들고 다시 열 수 있는지 확인하고 있습니다…', true);
  try {
    const artifact = await exportDocument();
    if (!artifact) return;
    const name = hwpName(snapshot.name);
    downloadBlob(new Blob([artifact.bytes], { type: 'application/x-hwp' }), name);
    await markSaved(artifact);
    status(`${name} 다운로드를 시작했습니다. 파일은 서버로 전송되지 않았습니다.`);
  } catch (e) { error(`HWP로 저장하지 못했습니다. 편집 내용은 유지됩니다. ${e.message}`); }
  finally { setBusy(false); }
};
