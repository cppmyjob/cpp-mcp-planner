/**
 * File Utilities - Shared file operations for repositories
 *
 * Provides atomic file operations used across all file-based repositories
 * and managers. Uses write-file-atomic for Windows-compatible atomic writes.
 */

import * as fs from 'fs/promises';
import writeFileAtomic from 'write-file-atomic';
import { ValidationError } from '../../../domain/repositories/errors.js';

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
 * GREEN: Phase 4.18 - Enhanced error handling with descriptive messages
 *
 * @param filePath - File path to read
 * @returns Parsed JSON data
 * @throws ValidationError if file is empty or JSON is invalid
 * @throws ENOENT if file doesn't exist (propagated from fs.readFile)
 */
export async function loadJSON<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf-8');

  // GREEN: Phase 4.18 - Handle empty or whitespace-only files
  if (content.trim() === '') {
    throw new ValidationError(
      `Invalid JSON in ${filePath}: file is empty or contains only whitespace`,
      [
        {
          field: 'content',
          message: 'File is empty or contains only whitespace',
        },
      ],
      { filePath }
    );
  }

  // GREEN: Phase 4.18 - Wrap JSON.parse errors with position information
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Extract position info from SyntaxError message (e.g., "Unexpected token } in JSON at position 42")
      const positionMatch = /at position (\d+)/i.exec(error.message);
      const position = positionMatch !== null ? positionMatch[1] : 'unknown';

      // Try to determine line number from position
      let lineInfo = '';
      if (positionMatch !== null) {
        const pos = Number.parseInt(positionMatch[1], 10);
        const lines = content.substring(0, pos).split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1]?.length ?? 0;
        lineInfo = ` (line ${String(line)}, column ${String(column)})`;
      }

      throw new ValidationError(
        `Invalid JSON in ${filePath}: ${error.message}${lineInfo}`,
        [
          {
            field: 'content',
            message: `JSON parse error: ${error.message}`,
            value: position,
          },
        ],
        { filePath, parseError: error.message, position }
      );
    }
    // Re-throw non-SyntaxError errors
    throw error;
  }
}
