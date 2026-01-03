/**
 * GREEN: ProjectService - Domain service for project management
 *
 * Manages project lifecycle: initialization, CRUD operations, listing.
 * Works with ConfigService for config persistence and PlanService for plan counting.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ConfigService } from './config-service.js';
import type { PlanService } from './plan-service.js';
import type { ProjectConfig, ProjectInfo } from '../entities/types.js';
import { ValidationError } from '../repositories/errors.js';
import { isValidProjectId, validateWorkspacePath } from './validators.js';

// ============================================================================
// Input/Output Types
// ============================================================================

export interface InitProjectInput {
  workspacePath: string;
  config: ProjectConfig;
}

export interface InitProjectResult {
  success: boolean;
  projectId: string;
  configPath: string;
}

export interface ListProjectsInput {
  limit?: number;
  offset?: number;
}

export interface ListProjectsResult {
  projects: ProjectInfo[];
  total: number;
  hasMore: boolean;
}

export interface DeleteProjectResult {
  success: boolean;
}

// ============================================================================
// ProjectService
// ============================================================================

/** Default limit for project pagination */
const DEFAULT_PROJECTS_LIMIT = 50;

/**
 * ProjectService - Manages project lifecycle
 *
 * Features:
 * - Initialize projects (create .mcp-config.json)
 * - Get project from workspace
 * - List all projects with plan counts
 * - Get project details
 * - Delete project config
 */
export class ProjectService {
  constructor(
    private readonly configService: ConfigService,
    private readonly planService: PlanService
  ) {}

  /**
   * Initialize project in workspace
   *
   * Creates .mcp-config.json file in workspace directory.
   * Validates projectId format and checks for existing projects.
   *
   * @param workspacePath - Path to workspace directory
   * @param config - Project configuration
   * @returns InitProjectResult with success status and paths
   */
  public async initProject(workspacePath: string, config: ProjectConfig): Promise<InitProjectResult> {
    this.validateWorkspacePath(workspacePath);
    this.validateConfig(config);

    // Validate projectId format
    if (!isValidProjectId(config.projectId)) {
      throw new ValidationError(`Invalid projectId: "${config.projectId}". Must be lowercase alphanumeric with hyphens, 3-50 chars.`);
    }

    // Check if project already exists
    const existing = await this.configService.loadConfig(workspacePath);
    if (existing !== null) {
      throw new ValidationError(`Project already initialized at ${workspacePath}`);
    }

    // GREEN: Phase 3.8 - Check for case-insensitive conflicts with existing projects
    const existingProjects = await this.discoverProjects();
    const normalizedProjectId = config.projectId.toLowerCase();

    const conflict = existingProjects.find(
      (p) => p.id.toLowerCase() === normalizedProjectId && p.id !== config.projectId
    );

    if (conflict !== undefined) {
      throw new ValidationError(
        `Project ID conflict: "${config.projectId}" conflicts with existing project "${conflict.id}" (case-insensitive match)`
      );
    }

    // Save config
    await this.configService.saveConfig(workspacePath, config);

    const configPath = path.join(workspacePath, '.mcp-config.json');

    return {
      success: true,
      projectId: config.projectId,
      configPath,
    };
  }

  /**
   * Get project from workspace
   *
   * Loads project configuration from .mcp-config.json
   *
   * @param workspacePath - Path to workspace directory
   * @returns ProjectConfig or null if not found
   */
  public async getProject(workspacePath: string): Promise<ProjectConfig | null> {
    this.validateWorkspacePath(workspacePath);

    return this.configService.loadConfig(workspacePath);
  }

  /**
   * List all projects
   *
   * Scans storage directory for projects and counts plans.
   * Supports pagination.
   *
   * @param input - Optional pagination parameters
   * @returns ListProjectsResult with projects and metadata
   */
  public async listProjects(input?: ListProjectsInput): Promise<ListProjectsResult> {
    const limit = input?.limit ?? DEFAULT_PROJECTS_LIMIT;
    const offset = input?.offset ?? 0;

    // Get all project directories
    const allProjects = await this.discoverProjects();

    // GREEN: Phase 3.8 - Deduplicate case-insensitive projectIds (keep first occurrence)
    const seenIds = new Set<string>();
    const projects: ProjectInfo[] = [];

    for (const project of allProjects) {
      const normalizedId = project.id.toLowerCase();

      if (!seenIds.has(normalizedId)) {
        seenIds.add(normalizedId);
        projects.push(project);
      }
    }

    // Apply pagination
    const total = projects.length;
    const paginatedProjects = projects.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return {
      projects: paginatedProjects,
      total,
      hasMore,
    };
  }

  /**
   * Get project information with plan count
   *
   * @param projectId - Project ID
   * @returns ProjectInfo or null if not found
   */
  public async getProjectInfo(projectId: string): Promise<ProjectInfo | null> {
    this.validateProjectId(projectId);

    // Find project in discovered projects
    const projects = await this.discoverProjects();
    const project = projects.find((p) => p.id === projectId);

    return project ?? null;
  }

  /**
   * Delete project configuration
   *
   * Removes .mcp-config.json from workspace.
   * Does not delete plans - they remain in storage.
   *
   * @param workspacePath - Path to workspace directory
   * @returns DeleteProjectResult
   */
  public async deleteProject(workspacePath: string): Promise<DeleteProjectResult> {
    this.validateWorkspacePath(workspacePath);

    await this.configService.deleteConfig(workspacePath);

    return {
      success: true,
    };
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Discover all projects by scanning storage directory
   *
   * Reads project directories and counts plans for each.
   * Returns array of ProjectInfo.
   */
  private async discoverProjects(): Promise<ProjectInfo[]> {
    const projects: ProjectInfo[] = [];

    // Get planRepo to access baseDir
    const planRepo = (this.planService as unknown as { planRepo: { baseDir: string } }).planRepo;
    const baseDir = planRepo.baseDir;

    // Check if baseDir exists
    try {
      await fs.access(baseDir);
    } catch {
      // BaseDir doesn't exist, no projects
      return [];
    }

    // List all project directories
    const entries = await fs.readdir(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const projectId = entry.name;

      // Skip special directories
      if (projectId === '__legacy__' || projectId.startsWith('.')) {
        continue;
      }

      // Only include valid projectIds
      if (!isValidProjectId(projectId)) {
        continue;
      }

      // Get project metadata
      const projectDir = path.join(baseDir, projectId);
      const plansDir = path.join(projectDir, 'plans');

      // Check if plans directory exists (required for valid project)
      try {
        const plansDirStat = await fs.stat(plansDir);
        if (!plansDirStat.isDirectory()) {
          // Not a valid project directory structure
          continue;
        }
      } catch {
        // Plans directory doesn't exist - skip this directory
        continue;
      }

      // Count plans
      let plansCount = 0;
      try {
        const planEntries = await fs.readdir(plansDir, { withFileTypes: true });
        plansCount = planEntries.filter((e) => e.isDirectory()).length;
      } catch {
        // Plans directory exists but can't be read
        plansCount = 0;
      }

      // Get directory stats for timestamps
      const stats = await fs.stat(projectDir);

      projects.push({
        id: projectId,
        plansCount,
        createdAt: stats.birthtime.toISOString(),
        updatedAt: stats.mtime.toISOString(),
      });
    }

    return projects;
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

    // GREEN: Phase 4.20 - Use validateWorkspacePath for comprehensive validation
    validateWorkspacePath(workspacePath);
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

  private validateProjectId(projectId: string): void {
    // Runtime validation (TypeScript types don't prevent null/undefined at runtime)
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (projectId === undefined || projectId === null || typeof projectId !== 'string' || projectId.trim() === '') {
      throw new ValidationError('projectId is required and must be a non-empty string');
    }
  }
}
