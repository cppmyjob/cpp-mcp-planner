/**
 * File-based Config Repository Implementation
 *
 * Manages .mcp-config.json files in project directories.
 * Provides CRUD operations for ProjectConfig with Zod validation.
 *
 * Edge cases handled:
 * - File not found (returns null for loadConfig)
 * - Invalid JSON (throws ValidationError)
 * - Permission errors (propagate to caller)
 * - Symlink detection (prevents symlink traversal attacks)
 * - Tilde expansion (~/ paths to absolute paths)
 *
 * Uses atomic writes (write-file-atomic) for data integrity on Windows.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ConfigRepository } from '../../../domain/repositories/interfaces.js';
import type { ProjectConfig } from '../../../domain/entities/types.js';
import { BaseFileRepository } from './base-file-repository.js';
import { ValidationError } from '../../../domain/repositories/errors.js';
import { isValidProjectId } from '../../../domain/services/validators.js';

/**
 * File-based implementation of ConfigRepository
 *
 * Extends BaseFileRepository for common file operations.
 *
 * File location: {workspacePath}/.mcp-config.json
 *
 * Example:
 * ```typescript
 * const repo = new FileConfigRepository();
 * await repo.initialize();
 *
 * // Save config
 * await repo.saveConfig('/path/to/project', {
 *   projectId: 'my-project',
 *   name: 'My Project'
 * });
 *
 * // Load config
 * const config = await repo.loadConfig('/path/to/project');
 * ```
 */
export class FileConfigRepository
  extends BaseFileRepository
  implements ConfigRepository
{
  private static readonly configFilename = '.mcp-config.json';

  constructor() {
    // ConfigRepository doesn't use baseDir (manages files in project dirs)
    // Pass empty string to satisfy BaseFileRepository constructor
    super('');
  }

  /**
   * Initialize repository
   *
   * No-op for ConfigRepository since it manages files in user-specified directories.
   * Kept for interface compatibility and to mark repository as initialized.
   */
  public async initialize(): Promise<void> {
    if (this.isInitializedState()) {
      return Promise.resolve();
    }
    this.markInitialized();
    return Promise.resolve();
  }

  /**
   * Load project config from .mcp-config.json
   *
   * @param workspacePath - Path to workspace directory
   * @returns ProjectConfig or null if not found
   * @throws ValidationError if JSON is invalid or validation fails
   */
  public async loadConfig(workspacePath: string): Promise<ProjectConfig | null> {
    await this.ensureInitialized();

    const normalizedPath = this.normalizePath(workspacePath);
    await this.assertNotSymlink(normalizedPath);

    const configPath = path.join(normalizedPath, FileConfigRepository.configFilename);

    try {
      const data = await this.loadJSON<ProjectConfig>(configPath);

      // Validate structure
      this.validateProjectConfig(data, configPath);

      return data;
    } catch (error) {
      // File not found - return null (expected case)
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }

      // JSON parse error or ValidationError - propagate
      throw error;
    }
  }

  /**
   * Save project config to .mcp-config.json
   *
   * @param workspacePath - Path to workspace directory
   * @param config - Project configuration
   * @throws ValidationError if config is invalid
   */
  public async saveConfig(workspacePath: string, config: ProjectConfig): Promise<void> {
    await this.ensureInitialized();

    // Validate config
    this.validateProjectConfig(config, 'config parameter');

    const normalizedPath = this.normalizePath(workspacePath);
    await this.assertNotSymlink(normalizedPath);

    const configPath = path.join(normalizedPath, FileConfigRepository.configFilename);

    // Ensure directory exists
    await fs.mkdir(normalizedPath, { recursive: true });

    // Use atomic write from base class
    await this.atomicWriteJSON(configPath, config);
  }

  /**
   * Delete project config file
   *
   * @param workspacePath - Path to workspace directory
   */
  public async deleteConfig(workspacePath: string): Promise<void> {
    await this.ensureInitialized();

    const normalizedPath = this.normalizePath(workspacePath);
    await this.assertNotSymlink(normalizedPath);

    const configPath = path.join(normalizedPath, FileConfigRepository.configFilename);

    try {
      await fs.unlink(configPath);
    } catch {
      // File doesn't exist, ignore
    }
  }

  /**
   * Check if config file exists
   *
   * @param workspacePath - Path to workspace directory
   * @returns true if .mcp-config.json exists
   */
  public async configExists(workspacePath: string): Promise<boolean> {
    await this.ensureInitialized();

    const normalizedPath = this.normalizePath(workspacePath);

    try {
      await this.assertNotSymlink(normalizedPath);
    } catch {
      // Symlink detected - treat as non-existent for security
      return false;
    }

    const configPath = path.join(normalizedPath, FileConfigRepository.configFilename);

    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Close repository and cleanup
   *
   * No-op for FileConfigRepository (no persistent resources).
   * Kept for interface compatibility.
   */
  public async close(): Promise<void> {
    // No cleanup needed for file-based repository
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Validate ProjectConfig structure
   *
   * Validates:
   * - projectId exists and passes isValidProjectId() security checks
   * - name is optional string
   * - description is optional string
   *
   * @param config - Config to validate
   * @param context - Context for error message (file path or "config parameter")
   * @throws ValidationError if validation fails
   */
  private validateProjectConfig(config: ProjectConfig, context: string): void {
    // Check required field: projectId
    if (typeof config.projectId !== 'string' || config.projectId === '') {
      throw new ValidationError(
        `Invalid ProjectConfig in ${context}: projectId is required and must be a non-empty string`
      );
    }

    // Validate projectId format and security
    if (!isValidProjectId(config.projectId)) {
      throw new ValidationError(
        `Invalid ProjectConfig in ${context}: projectId "${config.projectId}" contains invalid characters or security violations`
      );
    }

    // Validate optional fields
    if (config.name !== undefined && typeof config.name !== 'string') {
      throw new ValidationError(
        `Invalid ProjectConfig in ${context}: name must be a string if provided`
      );
    }

    if (config.description !== undefined && typeof config.description !== 'string') {
      throw new ValidationError(
        `Invalid ProjectConfig in ${context}: description must be a string if provided`
      );
    }
  }

  /**
   * Normalize workspace path
   *
   * - Expands tilde (~/) to home directory
   * - Resolves to absolute path
   *
   * @param workspacePath - Workspace path (may contain ~/)
   * @returns Normalized absolute path
   */
  private normalizePath(workspacePath: string): string {
    let normalized = workspacePath;

    // Expand tilde if present
    normalized = this.expandTilde(normalized);

    // Resolve to absolute path
    normalized = path.resolve(normalized);

    return normalized;
  }

  /**
   * Expand tilde (~/) in path to home directory
   *
   * Supports:
   * - ~/... -> /home/user/...
   * - ~\ ... (Windows) -> C:\Users\user\...
   *
   * @param filePath - Path that may contain ~/
   * @returns Path with tilde expanded
   */
  private expandTilde(filePath: string): string {
    if (filePath.startsWith('~/') || filePath.startsWith('~\\')) {
      const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';
      return path.join(homeDir, filePath.slice(2));
    }
    return filePath;
  }

  /**
   * Assert that path is not a symlink
   *
   * Security check to prevent symlink traversal attacks.
   *
   * @param filePath - Path to check
   * @throws ValidationError if path is a symlink
   */
  private async assertNotSymlink(filePath: string): Promise<void> {
    try {
      const stats = await fs.lstat(filePath);
      if (stats.isSymbolicLink()) {
        throw new ValidationError(
          `Security violation: path is a symlink: ${filePath}`
        );
      }
    } catch (error) {
      // ENOENT is OK (path doesn't exist yet)
      if (
        error !== null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }
  }
}
