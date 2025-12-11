/**
 * File-based Plan Repository Implementation
 *
 * Manages plan-level operations:
 * - Plan directory structure creation/deletion
 * - Manifest CRUD operations with atomic writes
 * - Active plans index for workspace tracking
 *
 * Uses atomic writes (graceful-fs) for data integrity on Windows.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as util from 'util';
import gracefulFs from 'graceful-fs';
import type { PlanRepository } from '../../../domain/repositories/interfaces.js';
import type { PlanManifest, ActivePlansIndex } from '../../../domain/entities/types.js';

// graceful-fs provides retry logic for Windows file locking issues
const gracefulRename = util.promisify(gracefulFs.rename);

/**
 * File-based implementation of PlanRepository
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
export class FilePlanRepository implements PlanRepository {
  private baseDir: string;
  private plansDir: string;
  private activePlansPath: string;
  private isInitialized: boolean = false;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
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
    if (this.isInitialized) {
      return;
    }

    await fs.mkdir(this.plansDir, { recursive: true });
    await fs.mkdir(path.join(this.baseDir, '.history'), { recursive: true });

    this.isInitialized = true;
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
   * Uses atomic write to prevent data corruption.
   *
   * @param planId - Plan ID
   * @param manifest - Plan manifest object
   */
  async saveManifest(planId: string, manifest: PlanManifest): Promise<void> {
    const manifestPath = path.join(this.plansDir, planId, 'manifest.json');
    await this.atomicWrite(manifestPath, manifest);
  }

  /**
   * Load plan manifest
   *
   * @param planId - Plan ID
   * @returns Plan manifest object
   * @throws If manifest file doesn't exist or is invalid JSON
   */
  async loadManifest(planId: string): Promise<PlanManifest> {
    const manifestPath = path.join(this.plansDir, planId, 'manifest.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as PlanManifest;
  }

  /**
   * Save active plans index
   *
   * Stores workspace -> plan mapping for active plan tracking.
   * Uses atomic write to prevent data corruption.
   *
   * @param index - Active plans index object
   */
  async saveActivePlans(index: ActivePlansIndex): Promise<void> {
    await this.atomicWrite(this.activePlansPath, index);
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
   * @param planId - Plan ID
   * @param entityType - Entity type (requirement, solution, etc.)
   * @param entityId - Entity ID
   * @param history - Version history data
   */
  async saveVersionHistory(planId: string, entityType: string, entityId: string, history: any): Promise<void> {
    const historyPath = path.join(this.plansDir, planId, 'history', entityType, `${entityId}.json`);
    await this.atomicWrite(historyPath, history);
  }

  /**
   * Load version history for an entity
   *
   * @param planId - Plan ID
   * @param entityType - Entity type
   * @param entityId - Entity ID
   * @returns Version history data, or null if not found
   */
  async loadVersionHistory(planId: string, entityType: string, entityId: string): Promise<any | null> {
    const historyPath = path.join(this.plansDir, planId, 'history', entityType, `${entityId}.json`);
    try {
      const content = await fs.readFile(historyPath, 'utf-8');
      return JSON.parse(content);
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

  /**
   * Atomic write to prevent data corruption
   *
   * WINDOWS EPERM ISSUE:
   * On Windows, fs.rename() often fails with "EPERM: operation not permitted" when:
   * - Windows Defender is scanning the file
   * - Windows Search Indexer has the file open
   * - IDE (VS Code, etc.) holds file handles
   * - File system cache hasn't released the file
   *
   * This is a known Node.js issue marked as "wontfix":
   * https://github.com/nodejs/node/issues/29481
   *
   * SOLUTION:
   * We use graceful-fs which provides retry logic (up to 60s) for EPERM/EBUSY/EACCES errors.
   * This is the industry standard solution used by npm, webpack, etc.
   *
   * @param filePath - Target file path
   * @param data - Data to write (will be JSON.stringify'd)
   */
  private async atomicWrite(filePath: string, data: unknown): Promise<void> {
    const tmpPath = `${filePath}.tmp.${Date.now()}.${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Write to temp file
      await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf-8');

      // Verify JSON is valid before committing
      const written = await fs.readFile(tmpPath, 'utf-8');
      JSON.parse(written);

      // Atomic rename using graceful-fs (retries on EPERM/EBUSY/EACCES up to 60s)
      await gracefulRename(tmpPath, filePath);
    } catch (error) {
      // Cleanup temp file on error
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  }
}
