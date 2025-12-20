import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import { testOutputDir } from './e2e/test-paths';
import { WEB_SERVER_PORT, WEB_DASHBOARD_PORT, API_BASE_URL } from '@mcp-planner/config/client';

/**
 * Playwright configuration for MCP Planning Dashboard E2E tests
 */
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: [['html', { outputFolder: resolve(testOutputDir, 'playwright-report') }]],
  outputDir: resolve(testOutputDir, 'test-results'),
  snapshotPathTemplate: resolve(testOutputDir, 'screenshots/{testFilePath}/{arg}{ext}'),

  use: {
    baseURL: `http://localhost:${WEB_DASHBOARD_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Run Angular dev server before starting tests */
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../web-server',
      url: `${API_BASE_URL}/plans`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60000,
    },
    {
      command: 'npm start',
      url: `http://localhost:${WEB_DASHBOARD_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60000,
    },
  ],
});
