import { resolve } from 'path';

/**
 * Root test output directory (monorepo root)
 *
 * Centralized location for all test artifacts:
 * - Screenshots: .test-output/screenshots/
 * - Coverage: .test-output/coverage/
 * - Playwright reports: .test-output/playwright-report/
 *
 * Keeps test artifacts out of package directories and gitignored at root.
 */
export const testOutputDir = resolve(__dirname, '../../../.test-output');

/** Screenshot output directory */
export const screenshotsDir = resolve(testOutputDir, 'screenshots');

/**
 * Returns absolute path for a screenshot file
 * @param filename - Screenshot filename (e.g., 'dashboard-dark-theme.png')
 * @returns Absolute path to the screenshot file
 */
export function screenshotPath(filename: string): string {
  return resolve(screenshotsDir, filename);
}
