import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', timeout: 90000, expect: { timeout: 15000 },
  fullyParallel: false, workers: 1,
  outputDir: process.env.QA_OUTPUT_DIR ? `${process.env.QA_OUTPUT_DIR}/playwright-results` : '.test-data/results/playwright-results',
  reporter: [['list']],
  use: { baseURL: process.env.VIEWER_URL || 'http://localhost:8787/', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: process.env.VIEWER_URL ? undefined : { command: 'python3 scripts/serve.py --port 8787', url: 'http://localhost:8787/', reuseExistingServer: true },
});
