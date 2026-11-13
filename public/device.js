// Device categories use browser/device signals, never viewport breakpoints.
export function detectDevice(nav = navigator) {
  const ua = nav.userAgent || '';
  const platform = nav.userAgentData?.platform || nav.platform || '';
  const touch = Number(nav.maxTouchPoints || 0);
  if (/iPhone|iPod|Windows Phone/i.test(ua)) return 'phone';
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || ((/Mac/i.test(platform) || /Macintosh/i.test(ua)) && touch > 1)) return 'tablet';
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'phone' : 'tablet';
  if (nav.userAgentData?.mobile || /Mobile|webOS|BlackBerry/i.test(ua)) return 'phone';
  return 'desktop';
}

const labels = { phone: '모바일', tablet: '태블릿', desktop: 'PC' };
const preferenceKey = 'hangeuldam-device-view';
const root = document.documentElement;
let automatic = detectDevice();
let preference = 'auto';
try { preference = localStorage.getItem(preferenceKey) || 'auto'; } catch { /* Storage is optional. */ }
if (!['auto', 'phone', 'tablet', 'desktop'].includes(preference)) preference = 'auto';
const category = () => preference === 'auto' ? automatic : preference;
root.dataset.device = category();
root.dataset.deviceDetected = automatic;

function setDrawer(open) {
  const sidebar = document.querySelector('.sidebar');
  const button = document.getElementById('device-library');
  if (!sidebar || !button) return;
  const allowed = category() !== 'desktop' && open;
  root.classList.toggle('device-library-open', allowed);
  button.setAttribute('aria-expanded', String(allowed));
  document.getElementById('device-library-backdrop').hidden = !allowed;
  if (allowed) document.getElementById('device-library-close').focus();
}

function applyCategory() {
  root.dataset.device = category();
  root.dataset.deviceDetected = automatic;
  const picker = document.getElementById('device-view');
  if (picker) {
    picker.value = preference;
    picker.options[0].textContent = `자동 · ${labels[automatic]}`;
  }
  setDrawer(false);
  document.querySelectorAll('#editor-host iframe').forEach(configureEditorDevice);
  window.dispatchEvent(new CustomEvent('hangeuldam:devicechange', { detail: { device: category(), detected: automatic } }));
  requestAnimationFrame(() => document.getElementById('fit-page')?.click());
}

function mountDeviceControls() {
  const sidebar = document.querySelector('.sidebar');
  const actions = document.querySelector('.appbar-actions');
  if (!sidebar || !actions) return;
  sidebar.id ||= 'device-document-library';
  const library = document.createElement('button');
  library.type = 'button'; library.id = 'device-library';
  library.className = 'button secondary compact'; library.textContent = '문서함';
  library.setAttribute('aria-controls', sidebar.id); library.setAttribute('aria-expanded', 'false');
  library.addEventListener('click', () => setDrawer(!root.classList.contains('device-library-open')));
  actions.prepend(library);
  const close = document.createElement('button');
  close.type = 'button'; close.id = 'device-library-close'; close.className = 'button secondary compact';
  close.textContent = '닫기'; close.setAttribute('aria-label', '문서함 닫기');
  close.addEventListener('click', () => { setDrawer(false); library.focus(); });
  sidebar.querySelector('.sidebar-heading').append(close);
  const backdrop = document.createElement('button');
  backdrop.id = 'device-library-backdrop'; backdrop.type = 'button'; backdrop.hidden = true;
  backdrop.setAttribute('aria-label', '문서함 닫기'); backdrop.tabIndex = -1;
  backdrop.addEventListener('click', () => setDrawer(false));
  document.body.append(backdrop);
  const setting = document.createElement('label'); setting.className = 'device-view-setting';
  setting.htmlFor = 'device-view'; setting.append('화면 보기');
  const picker = document.createElement('select'); picker.id = 'device-view';
  for (const [value, text] of [['auto', `자동 · ${labels[automatic]}`], ...Object.entries(labels)]) {
    const option = document.createElement('option'); option.value = value; option.textContent = text; picker.append(option);
  }
  picker.value = preference;
  picker.addEventListener('change', () => {
    preference = picker.value;
    try { localStorage.setItem(preferenceKey, preference); } catch { /* Storage is optional. */ }
    applyCategory();
  });
  setting.append(picker); sidebar.querySelector('.sidebar-description').after(setting);
  document.getElementById('saved-list').addEventListener('click', event => {
    if (event.target.closest('.saved-open')) setDrawer(false);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('device-library-open')) { setDrawer(false); library.focus(); }
  });
  applyCategory();
}

// Call after loadFile; no document bytes leave this same-origin frame.
export function configureEditorDevice(frame) {
  const doc = frame.contentDocument;
  if (!doc?.documentElement) return;
  doc.documentElement.dataset.device = category();
  if (!doc.getElementById('hangeuldam-device-css')) {
    const css = doc.createElement('link'); css.id = 'hangeuldam-device-css'; css.rel = 'stylesheet';
    css.href = new URL('./studio-device.css', import.meta.url).href; doc.head.append(css);
  }
  let strip = doc.getElementById('hangeuldam-touch-tools');
  if (!strip) {
    strip = doc.createElement('nav'); strip.id = 'hangeuldam-touch-tools'; strip.setAttribute('aria-label', '터치 편집 도구');
    const input = doc.createElement('button'); input.type = 'button'; input.textContent = '글 입력'; input.id = 'hangeuldam-input';
    input.addEventListener('click', () => doc.querySelector('textarea[aria-label="문서 편집 입력"]')?.focus({ preventScroll: true }));
    const fit = doc.createElement('button'); fit.type = 'button'; fit.textContent = '폭 맞춤'; fit.id = 'hangeuldam-fit';
    fit.addEventListener('click', () => doc.getElementById('sb-zoom-fit-width')?.click());
    const tools = doc.createElement('button'); tools.type = 'button'; tools.textContent = '서식 도구'; tools.id = 'hangeuldam-format';
    tools.setAttribute('aria-expanded', 'false'); tools.setAttribute('aria-controls', 'icon-toolbar style-bar');
    tools.addEventListener('click', () => {
      const expanded = doc.documentElement.classList.toggle('hangeuldam-tools-expanded');
      tools.setAttribute('aria-expanded', String(expanded));
    });
    const zoomOut = doc.createElement('button'); zoomOut.type = 'button'; zoomOut.textContent = '−'; zoomOut.id = 'hangeuldam-zoom-out';
    zoomOut.setAttribute('aria-label', '문서 축소');
    zoomOut.addEventListener('click', () => doc.getElementById('sb-zoom-out')?.click());
    const zoomIn = doc.createElement('button'); zoomIn.type = 'button'; zoomIn.textContent = '+'; zoomIn.id = 'hangeuldam-zoom-in';
    zoomIn.setAttribute('aria-label', '문서 확대');
    zoomIn.addEventListener('click', () => doc.getElementById('sb-zoom-in')?.click());
    strip.append(input, fit, zoomOut, zoomIn, tools);
    doc.getElementById('studio-header')?.prepend(strip);
  }
  if (category() !== 'desktop') {
    // Keep this as the engine's fit mode so its own resize handler follows rotation.
    frame.contentWindow.requestAnimationFrame(() => doc.getElementById('sb-zoom-fit-width')?.click());
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountDeviceControls, { once: true });
else mountDeviceControls();
let resizeTimer;
window.addEventListener('resize', () => {
  if (category() === 'desktop') return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!document.getElementById('document-view')?.classList.contains('editing')) document.getElementById('fit-page')?.click();
  }, 150);
});
