import { rm, mkdir } from 'fs/promises';
import { resolve } from 'path';

export default async function globalSetup(): Promise<void> {
  const baseDir = resolve(__dirname, '..');

  const dirsToClean = [
    resolve(__dirname, 'screenshots'),
    resolve(baseDir, 'playwright-report'),
    resolve(baseDir, 'test-results'),
  ];

  for (const dir of dirsToClean) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }

  console.log('Cleaned: screenshots, playwright-report, test-results');
}
