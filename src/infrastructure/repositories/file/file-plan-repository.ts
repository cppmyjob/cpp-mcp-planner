/**
 * File-based Plan Repository Implementation
 *
 * Manages plan-level operations:
 * - Plan directory structure creation/deletion
 * - Manifest CRUD operations with atomic writes
 * - Active plans index for workspace tracking
 *
 * Uses atomic writes (graceful-fs) for data integrity on Windows.
 *
 * Extends BaseFileRepository to inherit common functionality:
 * - atomicWriteJSON() for safe file writes
 * - loadJSON() for file reading
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { PlanRepository } from '../../../domain/repositories/interfaces.js';
import type { PlanManifest, ActivePlansIndex } from '../../../domain/entities/types.js';
import { BaseFileRepository } from './base-file-repository.js';

/**
 * File-based implementation of PlanRepository
 *
 * Extends BaseFileRepository for common file operations.
 *
 * Directory structure:
 * ```
 * baseDir/
 *   plans/
 *     {planId}/
 *       manifest.json
 *       entities/
 *         requirements.json
 *         solutions.json
 *         decisions.json
 *         phases.json
 *         artifacts.json
 *       links.json
 *       history/
 *         requirement/
 *         solution/
 *         decision/
 *         phase/
 *         artifact/
 *       versions/
 *       exports/
 *   active-plans.json
 * ```
 */
export class FilePlanRepository
  extends BaseFileRepository
  implements PlanRepository
{
  private plansDir: string;
  private activePlansPath: string;

  constructor(baseDir: string) {
    super(baseDir);
    this.plansDir = path.join(baseDir, 'plans');
    this.activePlansPath = path.join(baseDir, 'active-plans.json');
  }

  /**
   * Initialize plan storage
   *
   * Creates base directory structure for plans and active plans index.
   * Safe to call multiple times (idempotent).
   */
  async initialize(): Promise<void> {
    if (this.isInitializedState()) {
      return;
    }

    await fs.mkdir(this.plansDir, { recursive: true });
    await fs.mkdir(path.join(this.baseDir, '.history'), { recursive: true });

    this.markInitialized();
  }

  /**
   * Create plan directory structure
   *
   * Creates all necessary subdirectories for a new plan:
   * - entities/ (for entity JSON files)
   * - history/ (for version history, with subdirs per entity type)
   * - versions/ (for plan snapshots/deltas)
   * - exports/ (for exported files)
   *
   * @param planId - Plan ID
   */
  async createPlan(planId: string): Promise<void> {
    const planDir = path.join(this.plansDir, planId);

    // Create main directories
    await fs.mkdir(planDir, { recursive: true });
    await fs.mkdir(path.join(planDir, 'entities'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'versions'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'exports'), { recursive: true });

    // Create history directories for each entity type
    await fs.mkdir(path.join(planDir, 'history'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'requirement'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'solution'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'decision'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'phase'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'artifact'), { recursive: true });
  }

  /**
   * Delete plan and all its data
   *
   * Recursively removes plan directory and all contents.
   * Safe to call even if plan doesn't exist.
   *
   * @param planId - Plan ID
   */
  async deletePlan(planId: string): Promise<void> {
    const planDir = path.join(this.plansDir, planId);
    await fs.rm(planDir, { recursive: true, force: true });
  }

  /**
   * List all plan IDs
   *
   * Returns array of plan IDs (directory names in plans/).
   * Returns empty array if plans directory doesn't exist.
   *
   * @returns Array of plan IDs
   */
  async listPlans(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.plansDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      return [];
    }
  }

  /**
   * Check if plan exists
   *
   * @param planId - Plan ID
   * @returns true if plan directory exists
   */
  async planExists(planId: string): Promise<boolean> {
    try {
      const planDir = path.join(this.plansDir, planId);
      await fs.access(planDir);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Save plan manifest
   *
   * Uses atomic write to prevent data corruption (delegates to base class).
   *
   * @param planId - Plan ID
   * @param manifest - Plan manifest object
   */
  async saveManifest(planId: string, manifest: PlanManifest): Promise<void> {
    const manifestPath = path.join(this.plansDir, planId, 'manifest.json');
    await this.atomicWriteJSON(manifestPath, manifest);
  }

  /**
   * Load plan manifest
   *
   * Delegates to base class loadJSON().
   *
   * @param planId - Plan ID
   * @returns Plan manifest object
   * @throws If manifest file doesn't exist or is invalid JSON
   */
  async loadManifest(planId: string): Promise<PlanManifest> {
    const manifestPath = path.join(this.plansDir, planId, 'manifest.json');
    return this.loadJSON<PlanManifest>(manifestPath);
  }

  /**
   * Save active plans index
   *
   * Stores workspace -> plan mapping for active plan tracking.
   * Uses atomic write to prevent data corruption (delegates to base class).
   *
   * @param index - Active plans index object
   */
  async saveActivePlans(index: ActivePlansIndex): Promise<void> {
    await this.atomicWriteJSON(this.activePlansPath, index);
  }

  /**
   * Load active plans index
   *
   * Returns empty object if index file doesn't exist.
   *
   * @returns Active plans index object
   */
  async loadActivePlans(): Promise<ActivePlansIndex> {
    try {
      const content = await fs.readFile(this.activePlansPath, 'utf-8');
      return JSON.parse(content) as ActivePlansIndex;
    } catch {
      return {};
    }
  }

  /**
   * Save export file
   *
   * Saves exported content to the plan's exports directory.
   *
   * @param planId - Plan ID
   * @param filename - Export filename (e.g. 'plan-export.md')
   * @param content - Export content
   * @returns Full path to saved file
   */
  async saveExport(planId: string, filename: string, content: string): Promise<string> {
    const exportPath = path.join(this.plansDir, planId, 'exports', filename);
    await fs.writeFile(exportPath, content, 'utf-8');
    return exportPath;
  }

  /**
   * Save version history for an entity
   *
   * Uses atomic write (delegates to base class).
   *
   * @param planId - Plan ID
   * @param entityType - Entity type (requirement, solution, etc.)
   * @param entityId - Entity ID
   * @param history - Version history data
   */
  async saveVersionHistory(planId: string, entityType: string, entityId: string, history: any): Promise<void> {
    const historyPath = path.join(this.plansDir, planId, 'history', entityType, `${entityId}.json`);
    await this.atomicWriteJSON(historyPath, history);
  }

  /**
   * Load version history for an entity
   *
   * Uses loadJSON from base class.
   *
   * @param planId - Plan ID
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns Version history data, or null if not found
   */
  async loadVersionHistory(planId: string, entityType: string, entityId: string): Promise<any | null> {
    const historyPath = path.join(this.plansDir, planId, 'history', entityType, `${entityId}.json`);
    try {
      return await this.loadJSON(historyPath);
    } catch {
      return null;
    }
  }

  /**
   * Delete version history for an entity
   *
   * @param planId - Plan ID
   * @param entityType - Entity type
   * @param entityId - Entity ID
   */
  async deleteVersionHistory(planId: string, entityType: string, entityId: string): Promise<void> {
    const historyPath = path.join(this.plansDir, planId, 'history', entityType, `${entityId}.json`);
    try {
      await fs.unlink(historyPath);
    } catch {
      // File doesn't exist, ignore
    }
  }

  // atomicWrite() is now provided by BaseFileRepository.atomicWriteJSON()
}
