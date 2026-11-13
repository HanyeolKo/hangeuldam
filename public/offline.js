const REQUIRED_FEATURE = 'offline-test-v4';
const $ = id => document.getElementById(id);
const size = value => `${(value / 1024 / 1024).toFixed(1)} MB`;
const onlineText = () => navigator.onLine ? '오프라인 준비 완료' : '오프라인 사용 중';
let registration, preparing = false, testing = false, ready = false;
let progressBytes = 0, progressPercent = 0;

function workerMessage(worker, type, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('저장 상태 확인 시간을 초과했습니다. 다시 시도해 주세요.')); }, timeout);
    channel.port1.onmessage = ({ data }) => {
      clearTimeout(timer); channel.port1.close();
      data.error ? reject(new Error(data.error)) : resolve(data);
    };
    worker.postMessage({ type }, [channel.port2]);
  });
}
async function inspectCache() {
  registration = await navigator.serviceWorker.getRegistration(new URL('./', import.meta.url));
  if (!registration?.active) return { ready: false };
  const result = await workerMessage(registration.active, 'STATUS');
  return { ...result, ready: result.ready && result.features?.includes(REQUIRED_FEATURE) };
}
function updateButton() {
  $('offline-button').disabled = preparing || testing;
  $('offline-button').textContent = testing ? '오프라인 테스트 중…' : preparing ? '오프라인 준비 중…' : ready ? '오프라인 준비 테스트' : '오프라인 사용 준비';
  $('offline-repair').disabled = preparing || testing;
  $('offline-repair').hidden = !registration?.active;
}
function progress(completeBytes, totalBytes, complete = false) {
  if (!(totalBytes > 0)) return;
  progressBytes = Math.max(progressBytes, Math.min(completeBytes, totalBytes));
  const value = complete ? 100 : Math.max(progressPercent, Math.min(99, Math.floor(progressBytes / totalBytes * 100)));
  progressPercent = value;
  $('offline-progress-wrap').hidden = false;
  $('offline-progress').value = value;
  $('offline-progress-value').textContent = `${value}%`;
  $('offline-progress-size').textContent = `${size(Math.min(progressBytes, totalBytes))} / ${size(totalBytes)}`;
}
async function refresh() {
  if (preparing || testing) return;
  try {
    const state = await inspectCache();
    ready = Boolean(state.ready);
    if (ready) {
      $('offline-status').textContent = `${onlineText()} · 버튼을 눌러 저장된 앱의 동작을 확인할 수 있습니다.`;
      progress(state.totalBytes, state.totalBytes, true);
    } else {
      $('offline-status').textContent = '편집기와 글꼴을 이 브라우저에 저장합니다. 준비 후 인터넷 없이 같은 주소에서 사용할 수 있습니다.';
    }
  } catch { $('offline-status').textContent = '오프라인 준비 상태를 확인하지 못했습니다. 다시 준비해 주세요.'; }
  updateButton();
}
function waitForActivation(worker) {
  return new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); worker.removeEventListener('statechange', changed); error ? reject(error) : resolve(); };
    const changed = () => {
      if (worker.state === 'activated') finish();
      else if (worker.state === 'redundant') finish(new Error('앱을 저장하지 못했습니다. 저장 공간과 연결을 확인한 뒤 다시 시도해 주세요.'));
    };
    const timer = setTimeout(() => finish(new Error('다운로드 시간을 초과했습니다. 연결을 확인한 뒤 다시 시도해 주세요.')), 180000);
    worker.addEventListener('statechange', changed); changed();
  });
}
async function prepare() {
  if (preparing || testing) return;
  preparing = true; progressBytes = 0; progressPercent = 0; updateButton();
  $('offline-test-result').hidden = true;
  $('offline-status').textContent = '편집기와 글꼴을 다운로드하고 있습니다…';
  $('offline-progress-wrap').hidden = false;
  $('offline-progress').value = 0; $('offline-progress-value').textContent = '0%';
  $('offline-progress-size').textContent = '다운로드 용량 확인 중';
  try {
    if (!navigator.onLine) throw new Error('앱을 새로 저장할 때는 인터넷 연결이 필요합니다.');
    registration = await navigator.serviceWorker.register(new URL('./sw.js', import.meta.url), { scope: new URL('./', import.meta.url).href, updateViaCache: 'none' });
    await registration.update();
    const installing = registration.installing || registration.waiting;
    if (installing && installing.state !== 'activated') await waitForActivation(installing);
    if (!registration.active) throw new Error('오프라인 앱을 활성화하지 못했습니다.');
    await workerMessage(registration.active, 'PREPARE', 180000);
    const state = await inspectCache();
    if (!state.ready) throw new Error('앱의 일부 파일이 저장되지 않았습니다. 다시 준비해 주세요.');
    ready = true;
    progress(state.totalBytes, state.totalBytes, true);
    $('offline-status').textContent = '오프라인 준비 완료 · 원할 때 아래 버튼으로 테스트하세요.';
    if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
  } catch (error) {
    ready = false;
    $('offline-status').textContent = `오프라인 준비 실패: ${error.message}`;
  } finally { preparing = false; updateButton(); }
}
async function testOffline() {
  if (preparing || testing) return;
  testing = true; updateButton();
  const result = $('offline-test-result');
  result.hidden = false; result.dataset.state = 'running';
  result.textContent = '저장된 앱으로 예제 문서 열기·편집·HWP 생성·다시 열기를 확인하고 있습니다. 열린 문서는 그대로 유지됩니다.';
  let frame;
  try {
    const state = await inspectCache();
    if (!state.ready) throw new Error('저장된 앱 파일이 부족하거나 오래되었습니다. ‘오프라인 파일 다시 받기’를 눌러 주세요.');
    if (!navigator.serviceWorker.controller) throw new Error('새로고침한 뒤 테스트를 다시 눌러 주세요.');
    const run = crypto.randomUUID();
    const url = new URL('./studio/offline-test.html', import.meta.url);
    url.searchParams.set('hangeuldam-offline-test', '1'); url.searchParams.set('run', run);
    frame = document.createElement('iframe'); frame.hidden = true; frame.id = 'offline-test-frame';
    frame.title = '오프라인 예제 문서 테스트';
    await new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', message); };
      const message = event => {
        if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.type !== 'HANGEULDAM_OFFLINE_TEST_RESULT' || event.data.run !== run) return;
        cleanup(); event.data.ok ? resolve() : reject(new Error(event.data.error));
      };
      const timer = setTimeout(() => { cleanup(); reject(new Error('테스트를 끝내지 못했습니다. 새로고침하거나 오프라인 파일을 다시 받아 주세요.')); }, 60000);
      window.addEventListener('message', message);
      frame.src = url.href; document.body.append(frame);
    });
    result.dataset.state = 'success';
    result.textContent = '테스트 통과 · 저장된 앱 파일, 글꼴, 예제 문서 열기·표시·편집·HWP 생성·다시 열기를 확인했습니다. 테스트는 네트워크를 사용하지 않았습니다.';
    $('offline-status').textContent = `${onlineText()} · 오프라인 준비 테스트 통과`;
  } catch (error) {
    result.dataset.state = 'failure'; result.textContent = `테스트 실패 · ${error.message}`;
    $('offline-status').textContent = `${navigator.onLine ? '오프라인 준비 확인 필요' : '오프라인 사용 중'} · 테스트 결과를 확인해 주세요.`;
  } finally { frame?.remove(); testing = false; updateButton(); }
}
export function initOffline() {
  const button = $('offline-button');
  if (!button || button.dataset.offlineMounted) return;
  button.dataset.offlineMounted = 'true';
  const wrap = document.createElement('div'); wrap.id = 'offline-progress-wrap'; wrap.hidden = true;
  const line = document.createElement('div'); line.className = 'offline-progress-label';
  const value = document.createElement('strong'); value.id = 'offline-progress-value'; value.textContent = '0%';
  const bytes = document.createElement('span'); bytes.id = 'offline-progress-size';
  line.append(value, bytes);
  const meter = document.createElement('progress'); meter.id = 'offline-progress'; meter.max = 100; meter.value = 0;
  meter.setAttribute('aria-label', '오프라인 파일 다운로드 진행률');
  wrap.append(line, meter); button.before(wrap);
  const result = document.createElement('p'); result.id = 'offline-test-result'; result.hidden = true; result.setAttribute('role', 'status');
  const repair = document.createElement('button'); repair.id = 'offline-repair'; repair.type = 'button'; repair.className = 'text-button'; repair.hidden = true;
  repair.textContent = '오프라인 파일 다시 받기'; repair.addEventListener('click', prepare);
  const note = document.createElement('p'); note.className = 'offline-test-note';
  note.textContent = '테스트는 이 앱의 저장본만 사용합니다. 기기의 인터넷 설정은 바꾸지 않습니다. 실제 사용은 같은 브라우저·주소로 다시 열거나 설치한 앱에서 가능합니다.';
  button.after(repair, result, note);
  if (!window.isSecureContext || !('serviceWorker' in navigator)) {
    $('offline-status').textContent = '오프라인 준비는 HTTPS 또는 localhost에서 가능합니다.'; button.disabled = true; return;
  }
  button.addEventListener('click', () => ready ? testOffline() : prepare());
  navigator.serviceWorker.addEventListener('message', ({ data }) => {
    if (preparing && data?.type === 'HANGEULDAM_CACHE_PROGRESS') {
      // 100% is reserved for the complete cache verification, not merely the last byte received.
      progress(data.completeBytes, data.totalBytes);
      $('offline-status').textContent = '편집기와 글꼴을 다운로드하고 있습니다…';
    }
  });
  window.addEventListener('online', refresh); window.addEventListener('offline', refresh);
  refresh();
}
