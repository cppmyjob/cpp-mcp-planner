import { rm, mkdir } from 'fs/promises';
import { resolve } from 'path';
import { testOutputDir } from './test-paths';

export default async function globalSetup(): Promise<void> {
  const dirsToClean = [
    resolve(testOutputDir, 'screenshots'),
    resolve(testOutputDir, 'playwright-report'),
    resolve(testOutputDir, 'test-results'),
  ];

  for (const dir of dirsToClean) {
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
  }

  console.log(`Cleaned test output: ${testOutputDir}`);
}
