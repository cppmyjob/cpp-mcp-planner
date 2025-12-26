/**
 * GREEN: ConfigService - Domain service for project configuration management
 *
 * Manages .mcp-config.json files in workspace directories.
 * Provides business logic layer on top of ConfigRepository.
 */

import type { RepositoryFactory, ConfigRepository } from '../repositories/interfaces.js';
import type { ProjectConfig } from '../entities/types.js';
import { ValidationError } from '../repositories/errors.js';

/**
 * ConfigService - Manages project configuration
 *
 * Features:
 * - Load/save/delete workspace config files
 * - Validate config structure (projectId required)
 * - Check config existence
 * - GREEN: Phase 3.6 - Lazy loading pattern (create repo on first use)
 */
export class ConfigService {
  private configRepoCache?: ConfigRepository;

  constructor(private readonly repositoryFactory: RepositoryFactory) {
    // GREEN: Phase 3.6 - Don't create repository here, use lazy loading
  }

  /**
   * GREEN: Phase 3.6 - Lazy getter for ConfigRepository
   * Creates repository on first access and caches it
   */
  private get configRepo(): ConfigRepository {
    this.configRepoCache ??= this.repositoryFactory.createConfigRepository();
    return this.configRepoCache;
  }

  /**
   * Load project config from workspace
   *
   * @param workspacePath - Path to workspace directory
   * @returns ProjectConfig or null if not found
   */
  public async loadConfig(workspacePath: string): Promise<ProjectConfig | null> {
    this.validateWorkspacePath(workspacePath);

    return this.configRepo.loadConfig(workspacePath);
  }

  /**
   * Save project config to workspace
   *
   * @param workspacePath - Path to workspace directory
   * @param config - Project configuration
   */
  public async saveConfig(workspacePath: string, config: ProjectConfig): Promise<void> {
    this.validateWorkspacePath(workspacePath);
    this.validateConfig(config);

    await this.configRepo.saveConfig(workspacePath, config);
  }

  /**
   * Delete project config from workspace
   *
   * @param workspacePath - Path to workspace directory
   */
  public async deleteConfig(workspacePath: string): Promise<void> {
    this.validateWorkspacePath(workspacePath);

    await this.configRepo.deleteConfig(workspacePath);
  }

  /**
   * Check if config file exists in workspace
   *
   * @param workspacePath - Path to workspace directory
   * @returns true if config exists, false otherwise
   */
  public async configExists(workspacePath: string): Promise<boolean> {
    this.validateWorkspacePath(workspacePath);

    return this.configRepo.configExists(workspacePath);
  }

  // ============================================================================
  // Validation Helpers
  // ============================================================================

  private validateWorkspacePath(workspacePath: string): void {
    // Runtime validation (TypeScript types don't prevent null/undefined at runtime)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (workspacePath === undefined || workspacePath === null || typeof workspacePath !== 'string' || workspacePath.trim() === '') {
      throw new ValidationError('workspacePath is required and must be a non-empty string');
    }
  }

  private validateConfig(config: ProjectConfig): void {
    // Runtime validation (TypeScript types don't prevent null/undefined at runtime)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (config === undefined || config === null) {
      throw new ValidationError('config is required');
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (config.projectId === undefined || config.projectId === null || typeof config.projectId !== 'string' || config.projectId.trim() === '') {
      throw new ValidationError('projectId is required in config and must be a non-empty string');
    }
  }
}
