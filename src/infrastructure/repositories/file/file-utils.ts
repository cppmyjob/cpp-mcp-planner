/**
 * File Utilities - Shared file operations for repositories
 *
 * Provides atomic file operations used across all file-based repositories
 * and managers. Centralizes Windows-compatible graceful-fs logic.
 */

import * as fs from 'fs/promises';
import * as crypto from 'crypto';
import * as util from 'util';
import gracefulFs from 'graceful-fs';

// graceful-fs provides retry logic for Windows file locking issues (EPERM/EBUSY/EACCES)
const gracefulRename = util.promisify(gracefulFs.rename);

/**
 * Write JSON data to file atomically
 *
 * Uses temp file + rename pattern for crash safety:
 * 1. Write to temp file
 * 2. Verify JSON is valid
 * 3. Atomic rename to target (using graceful-fs for Windows compatibility)
 *
 * WINDOWS EPERM ISSUE:
 * On Windows, fs.rename() often fails with "EPERM: operation not permitted" when:
 * - Windows Defender is scanning the file
 * - Windows Search Indexer has the file open
 * - IDE (VS Code, etc.) holds file handles
 *
 * We use graceful-fs which provides retry logic (up to 60s) for these errors.
 *
 * @param filePath - Target file path
 * @param data - Data to write (will be JSON.stringify'd)
 */
export async function atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp.${String(Date.now())}.${crypto.randomBytes(4).toString('hex')}`;

  try {
    // Write to temp file
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

    // Verify JSON is valid before committing
    const written = await fs.readFile(tmpPath, 'utf-8');
    JSON.parse(written);

    // Atomic rename using graceful-fs (retries on EPERM/EBUSY/EACCES)
    await gracefulRename(tmpPath, filePath);
  } catch (error) {
    // Cleanup temp file on error
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- intentionally swallow cleanup errors
    await fs.unlink(tmpPath).catch(() => {});
    throw error;
  }
}

/**
 * Load JSON data from file
 *
 * @param filePath - File path to read
 * @returns Parsed JSON data
 * @throws If file doesn't exist or JSON is invalid
 */
export async function loadJSON<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(content) as T;
}
