// A separate, cache-only document never reads or writes the user's document storage.
const params = new URL(location.href).searchParams;
const run = params.get('run');
const send = (result) => parent.postMessage({ type: 'HANGEULDAM_OFFLINE_TEST_RESULT', run, ...result }, location.origin);
function cachedUrl(path) {
  const url = new URL(path, import.meta.url);
  url.searchParams.set('hangeuldam-offline-test', '1');
  return url;
}
async function cachedBytes(path) {
  const response = await fetch(cachedUrl(path), { cache: 'no-store' });
  if (!response.ok) throw new Error('저장된 앱 파일을 읽지 못했습니다. 다시 준비해 주세요.');
  return response.arrayBuffer();
}
(async () => {
  if (!run || params.get('hangeuldam-offline-test') !== '1' || !navigator.serviceWorker.controller) throw new Error('오프라인 테스트를 시작하지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.');
  // A unique uncached request proves this test cannot silently use the server.
  const blocked = await fetch(cachedUrl(`./offline-test-missing-${run}`), { cache: 'no-store' });
  if (blocked.status !== 503 || blocked.headers.get('X-Hangeuldam-Offline-Test') !== 'cache-only') throw new Error('네트워크 차단 검사를 통과하지 못했습니다.');
  const { default: init, HwpDocument } = await import(cachedUrl('./vendor/rhwp.js').href);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  globalThis.measureTextWidth = (font, text) => { context.font = font; return context.measureText(text).width; };
  for (const [name, file] of [['Nanum Gothic', 'NanumGothic-Regular.ttf'], ['Nanum Myeongjo', 'NanumMyeongjo-Regular.ttf']]) {
    const face = new FontFace(name, await cachedBytes(`./fonts/${file}`));
    document.fonts.add(await face.load());
  }
  await init({ module_or_path: await cachedBytes('./vendor/rhwp_bg.wasm') });
  const doc = new HwpDocument(new Uint8Array(await cachedBytes('./sample.hwp')));
  let verified;
  try {
    if (!doc.pageCount() || !doc.renderPageSvg(0).includes('<svg')) throw new Error('예제 문서를 표시하지 못했습니다.');
    const marker = '오프라인 준비 테스트 확인';
    doc.insertText(0, 0, 0, marker);
    const bytes = doc.exportHwp();
    const blob = new Blob([bytes], { type: 'application/x-hwp' });
    verified = new HwpDocument(new Uint8Array(await blob.arrayBuffer()));
    if (!JSON.parse(verified.getTextFileUnicode()).includes(marker)) throw new Error('편집한 HWP를 다시 읽지 못했습니다.');
    send({ ok: true, checks: ['cache-only', 'fonts', 'open', 'render', 'edit', 'export', 'reopen'] });
  } finally { verified?.free(); doc.free(); }
})().catch(error => send({ ok: false, error: String(error.message || error).slice(0, 250) }));
