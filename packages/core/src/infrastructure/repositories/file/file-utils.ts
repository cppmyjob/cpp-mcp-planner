/**
 * File Utilities - Shared file operations for repositories
 *
 * Provides atomic file operations used across all file-based repositories
 * and managers. Uses write-file-atomic for Windows-compatible atomic writes.
 */

import * as fs from 'fs/promises';
import writeFileAtomic from 'write-file-atomic';

/**
 * Write JSON data to file atomically
 *
 * Uses write-file-atomic package which:
 * 1. Writes to temp file with unique name (pid + threadId + invocation counter)
 * 2. Atomically renames to target
 * 3. Handles Windows file locking issues (EPERM/EBUSY/EACCES)
 *
 * WHY write-file-atomic instead of graceful-fs:
 * graceful-fs retries rename() with THE SAME temp file path, causing stale
 * error messages when Windows holds file locks. write-file-atomic generates
 * a unique temp path for EACH call via ++invocations counter.
 *
 * @param filePath - Target file path
 * @param data - Data to write (will be JSON.stringify'd)
 */
export async function atomicWriteJSON(filePath: string, data: unknown): Promise<void> {
  await writeFileAtomic(filePath, JSON.stringify(data, null, 2), { encoding: 'utf-8' });
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
