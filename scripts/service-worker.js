// Template: scripts/build-cache.mjs supplies the version and byte manifest.
const PREFIX = 'hangeuldam-' + new URL(self.registration.scope).pathname + '-';
const CACHE = PREFIX + '__CACHE_VERSION__';
const ASSETS = __ASSET_MANIFEST__;
const FEATURES = ['edit-hwp-v2', 'device-ui-v3', 'offline-test-v4'];
const TEST_QUERY = 'hangeuldam-offline-test';
const entries = ASSETS.map(asset => ({ ...asset, url: new URL(asset.path, self.registration.scope).href }));
const totalBytes = entries.reduce((sum, asset) => sum + asset.bytes, 0);
let preparation;

async function notifyProgress(completeBytes, phase = 'download') {
  for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
    if (client.url.startsWith(self.registration.scope)) client.postMessage({ type: 'HANGEULDAM_CACHE_PROGRESS', completeBytes, totalBytes, phase });
  }
}
async function storeAsset(cache, asset, progress) {
  const response = await fetch(new Request(asset.url, { cache: 'reload', credentials: 'same-origin' }));
  if (!response.ok) throw new Error('오프라인 파일을 받지 못했습니다. 연결을 확인해 주세요.');
  const chunks = [];
  let size = 0;
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > asset.bytes) throw new Error('앱 버전이 변경되었습니다. 새로고침한 뒤 다시 준비해 주세요.');
        chunks.push(value); await progress(size);
      }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    finally { reader.releaseLock(); }
  } else {
    const bytes = new Uint8Array(await response.arrayBuffer());
    size = bytes.byteLength; chunks.push(bytes); await progress(size);
  }
  if (size !== asset.bytes) throw new Error('앱 다운로드가 완전하지 않습니다. 다시 준비해 주세요.');
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== asset.sha256) throw new Error('앱 버전이 변경되었습니다. 새로고침한 뒤 다시 준비해 주세요.');
  const headers = new Headers(response.headers);
  // Fetch streams contain decoded bytes, so do not retain wire compression headers.
  headers.delete('Content-Encoding'); headers.set('Content-Length', String(size));
  await cache.put(asset.url, new Response(bytes, { status: response.status, statusText: response.statusText, headers }));
}
function prepare() {
  if (preparation) return preparation;
  preparation = (async () => {
    const cache = await caches.open(CACHE);
    let completeBytes = 0, lastNotice = 0;
    await notifyProgress(0);
    for (const asset of entries) {
      if (!(await cache.match(asset.url))) {
        await storeAsset(cache, asset, async downloaded => {
          const now = Date.now();
          if (now - lastNotice > 120) { lastNotice = now; await notifyProgress(completeBytes + downloaded); }
        });
      }
      completeBytes += asset.bytes;
      if (Date.now() - lastNotice > 120) { lastNotice = Date.now(); await notifyProgress(completeBytes); }
    }
    await notifyProgress(totalBytes, 'complete');
  })().finally(() => { preparation = null; });
  return preparation;
}
async function cacheStatus() {
  const cache = await caches.open(CACHE);
  const missing = [];
  let cachedBytes = 0;
  for (const asset of entries) {
    if (await cache.match(asset.url)) cachedBytes += asset.bytes;
    else missing.push(asset.path);
  }
  return { ready: !missing.length, missing: missing.length, cachedBytes, totalBytes, features: FEATURES, version: CACHE };
}
self.addEventListener('install', event => event.waitUntil(prepare().then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message', event => {
  const respond = value => event.ports[0]?.postMessage(value);
  if (event.data?.type === 'STATUS') event.waitUntil(cacheStatus().then(respond, error => respond({ error: error.message })));
  if (event.data?.type === 'PREPARE') event.waitUntil(prepare().then(() => respond({ ready: true }), error => respond({ error: error.message })));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const found = await cache.match(event.request, { ignoreSearch: true });
    if (found) return found;
    // Test requests must never fall through to the network, even after a worker restart.
    if (url.searchParams.get(TEST_QUERY) === '1') return new Response('Offline test: cached file is missing.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Hangeuldam-Offline-Test': 'cache-only', 'Cache-Control': 'no-store' },
    });
    try { return await fetch(event.request); }
    catch (error) {
      if (event.request.mode === 'navigate') return await cache.match(self.registration.scope) || Response.error();
      throw error;
    }
  })());
});
