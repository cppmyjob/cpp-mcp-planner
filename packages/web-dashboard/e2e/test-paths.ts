import { resolve } from 'path';

// Root test output directory (monorepo root)
export const testOutputDir = resolve(__dirname, '../../../.test-output');

// Screenshot output directory
export const screenshotsDir = resolve(testOutputDir, 'screenshots');

/**
 * Returns absolute path for a screenshot file
 */
export function screenshotPath(filename: string): string {
  return resolve(screenshotsDir, filename);
}
