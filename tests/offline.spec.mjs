import { test, expect } from '@playwright/test';

async function prepare(page) {
  await page.goto('./');
  await page.evaluate(() => {
    window.offlineProgressEvents = [];
    window.offlinePercentages = [];
    new MutationObserver(() => window.offlinePercentages.push(document.getElementById('offline-progress').value)).observe(document.getElementById('offline-progress'), { attributes: true, attributeFilter: ['value'] });
    navigator.serviceWorker.addEventListener('message', ({ data }) => {
      if (data?.type === 'HANGEULDAM_CACHE_PROGRESS') window.offlineProgressEvents.push(data);
    });
  });
  await page.locator('#offline-button').click();
  await expect(page.locator('#offline-button')).toHaveText('오프라인 준비 테스트', { timeout: 180000 });
  await expect(page.locator('#offline-progress-value')).toHaveText('100%');
}

test('offline preparation reports byte progress and only tests on demand without changing the edited document', async ({ page, context }) => {
  test.setTimeout(240000);
  await prepare(page);
  await expect(page.locator('#offline-test-frame')).toHaveCount(0);
  await expect(page.locator('#offline-test-result')).toBeHidden();
  const progress = await page.evaluate(() => window.offlineProgressEvents);
  const percentages = await page.evaluate(() => window.offlinePercentages);
  expect(percentages.every((value, i) => i === 0 || value >= percentages[i - 1])).toBe(true);
  expect(progress.some(event => event.completeBytes > 0 && event.completeBytes < event.totalBytes)).toBe(true);
  expect(progress.every(event => event.totalBytes > 10000000 && Number.isInteger(event.completeBytes))).toBe(true);
  await expect(page.locator('#offline-progress-size')).toContainText('MB');
  await expect(page.locator('#offline-status')).not.toContainText('개 파일');
  await page.locator('#sample-button').click();
  await expect(page.locator('#page-host svg')).toBeVisible();
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'true', { timeout: 60000 });
  await page.locator('#editor-host iframe').evaluate(frame => { frame.dataset.offlineOriginal = 'keep'; });
  const input = page.frameLocator('#editor-host iframe').locator('textarea[aria-label="문서 편집 입력"]');
  await input.focus(); await page.keyboard.press('Control+Home'); await page.keyboard.insertText('내편집유지확인 ');
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  await context.setOffline(true);
  await expect(page.locator('#offline-status')).toContainText('오프라인 사용 중');
  const testResponses = [];
  page.on('response', response => {
    if (response.url().includes('hangeuldam-offline-test=1')) testResponses.push(response.fromServiceWorker());
  });
  await page.locator('#offline-button').click();
  await expect(page.locator('#offline-test-result')).toHaveAttribute('data-state', 'success', { timeout: 70000 });
  await expect(page.locator('#offline-status')).toContainText('오프라인 사용 중');
  expect(testResponses.length).toBeGreaterThan(5);
  expect(testResponses.every(Boolean)).toBe(true);
  await expect(page.locator('#offline-test-frame')).toHaveCount(0);
  await expect(page.locator('#editor-host iframe')).toHaveAttribute('data-offline-original', 'keep');
  await expect(page.locator('#doc-state')).toContainText('저장하지 않은');
  await expect(page.locator('#saved-list .saved-open')).toHaveCount(0);
  await page.locator('#edit-document').click();
  await expect(page.locator('#edit-document')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#toggle-text').click();
  await expect(page.locator('#document-text')).toContainText('내편집유지확인');
});

test('offline test refuses missing cached files while online and repairs only when requested', async ({ page }) => {
  test.setTimeout(240000);
  await prepare(page);
  await page.evaluate(async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('hangeuldam-')) await (await caches.open(key)).delete(new URL('./vendor/rhwp_bg.wasm', location.href).href);
    }
  });
  const probe = await page.evaluate(async () => {
    const url = new URL('./vendor/rhwp_bg.wasm', location.href); url.searchParams.set('hangeuldam-offline-test', '1');
    const response = await fetch(url);
    return { status: response.status, guard: response.headers.get('X-Hangeuldam-Offline-Test') };
  });
  expect(probe).toEqual({ status: 503, guard: 'cache-only' });
  await page.locator('#offline-button').click();
  await expect(page.locator('#offline-test-result')).toHaveAttribute('data-state', 'failure');
  await expect(page.locator('#offline-test-result')).toContainText('오프라인 파일 다시 받기');
  await expect(page.locator('#offline-test-frame')).toHaveCount(0);
  await page.locator('#offline-repair').click();
  await expect(page.locator('#offline-button')).toHaveText('오프라인 준비 테스트', { timeout: 180000 });
  await expect(page.locator('#offline-test-result')).toBeHidden();
  await page.locator('#offline-button').click();
  await expect(page.locator('#offline-test-result')).toHaveAttribute('data-state', 'success', { timeout: 70000 });
});
