import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as util from 'util';
import gracefulFs from 'graceful-fs';
import type {
  PlanManifest,
  Entity,
  Link,
  ActivePlansIndex,
  EntityType,
} from '../domain/entities/types.js';

// graceful-fs provides retry logic for Windows file locking issues
const gracefulRename = util.promisify(gracefulFs.rename);

export class FileStorage {
  private baseDir: string;
  private plansDir: string;
  private activePlansPath: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
    this.plansDir = path.join(baseDir, 'plans');
    this.activePlansPath = path.join(baseDir, 'active-plans.json');
  }

  async initialize(): Promise<void> {
    await fs.mkdir(this.plansDir, { recursive: true });
    await fs.mkdir(path.join(this.baseDir, '.history'), { recursive: true });
  }

  // Plan directory operations
  async createPlanDirectory(planId: string): Promise<void> {
    const planDir = path.join(this.plansDir, planId);
    await fs.mkdir(planDir, { recursive: true });
    await fs.mkdir(path.join(planDir, 'entities'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'versions'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'exports'), { recursive: true });
    // Sprint 7: Create history directories for each entity type
    await fs.mkdir(path.join(planDir, 'history'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'requirement'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'solution'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'decision'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'phase'), { recursive: true });
    await fs.mkdir(path.join(planDir, 'history', 'artifact'), { recursive: true });
  }

  async deletePlan(planId: string): Promise<void> {
    const planDir = path.join(this.plansDir, planId);
    await fs.rm(planDir, { recursive: true, force: true });
  }

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

  async planExists(planId: string): Promise<boolean> {
    try {
      const planDir = path.join(this.plansDir, planId);
      await fs.access(planDir);
      return true;
    } catch {
      return false;
    }
  }

  // Manifest operations
  async saveManifest(planId: string, manifest: PlanManifest): Promise<void> {
    const manifestPath = path.join(this.plansDir, planId, 'manifest.json');
    await this.atomicWrite(manifestPath, manifest);
  }

  async loadManifest(planId: string): Promise<PlanManifest> {
    const manifestPath = path.join(this.plansDir, planId, 'manifest.json');
    const content = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(content) as PlanManifest;
  }

  // Entity operations
  async saveEntities<T extends Entity>(
    planId: string,
    entityType: string,
    entities: T[]
  ): Promise<void> {
    const entityPath = path.join(
      this.plansDir,
      planId,
      'entities',
      `${entityType}.json`
    );
    await this.atomicWrite(entityPath, entities);
  }

  async loadEntities<T extends Entity>(
    planId: string,
    entityType: string
  ): Promise<T[]> {
    const entityPath = path.join(
      this.plansDir,
      planId,
      'entities',
      `${entityType}.json`
    );
    try {
      const content = await fs.readFile(entityPath, 'utf-8');
      return JSON.parse(content) as T[];
    } catch {
      return [];
    }
  }

  // Link operations
  async saveLinks(planId: string, links: Link[]): Promise<void> {
    const linksPath = path.join(this.plansDir, planId, 'links.json');
    await this.atomicWrite(linksPath, links);
  }

  async loadLinks(planId: string): Promise<Link[]> {
    const linksPath = path.join(this.plansDir, planId, 'links.json');
    try {
      const content = await fs.readFile(linksPath, 'utf-8');
      return JSON.parse(content) as Link[];
    } catch {
      return [];
    }
  }

  // Active plans operations
  async saveActivePlans(index: ActivePlansIndex): Promise<void> {
    await this.atomicWrite(this.activePlansPath, index);
  }

  async loadActivePlans(): Promise<ActivePlansIndex> {
    try {
      const content = await fs.readFile(this.activePlansPath, 'utf-8');
      return JSON.parse(content) as ActivePlansIndex;
    } catch {
      return {};
    }
  }

  /**
   * Atomic write to prevent data corruption.
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
   * SOLUTIONS ATTEMPTED:
   * 1. Simple retry with backoff (50-100-200ms) - helped but not enough
   * 2. unlink(target) before rename - still got EPERM on rename itself
   * 3. copyFile + unlink(tmp) - worked 100% but less atomic
   * 4. graceful-fs (current) - industry standard, retries up to 60s
   *
   * RESULTS:
   * - copyFile: 25/25 tests passed (100%) - most reliable
   * - graceful-fs: ~90% pass rate - still occasional failures
   *
   * We use graceful-fs as the industry standard solution (used by npm, webpack, etc.)
   * despite slightly lower reliability, because it maintains true atomic rename semantics.
   *
   * If issues persist, consider switching to copyFile approach:
   *   await fs.copyFile(tmpPath, filePath);
   *   await fs.unlink(tmpPath).catch(() => {});
   */
  async atomicWrite(filePath: string, data: unknown): Promise<void> {
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

  // Version operations
  async saveVersion(
    planId: string,
    version: number,
    type: 'snapshot' | 'delta',
    data: unknown
  ): Promise<void> {
    const versionPath = path.join(
      this.plansDir,
      planId,
      'versions',
      `v${version}.${type}.json`
    );
    await this.atomicWrite(versionPath, data);
  }

  async loadVersion(
    planId: string,
    version: number,
    type: 'snapshot' | 'delta'
  ): Promise<unknown> {
    const versionPath = path.join(
      this.plansDir,
      planId,
      'versions',
      `v${version}.${type}.json`
    );
    const content = await fs.readFile(versionPath, 'utf-8');
    return JSON.parse(content);
  }

  async listVersions(planId: string): Promise<{ version: number; type: 'snapshot' | 'delta' }[]> {
    const versionsDir = path.join(this.plansDir, planId, 'versions');
    try {
      const files = await fs.readdir(versionsDir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => {
          const match = f.match(/^v(\d+)\.(snapshot|delta)\.json$/);
          if (match) {
            return {
              version: parseInt(match[1], 10),
              type: match[2] as 'snapshot' | 'delta',
            };
          }
          return null;
        })
        .filter((v): v is { version: number; type: 'snapshot' | 'delta' } => v !== null)
        .sort((a, b) => a.version - b.version);
    } catch {
      return [];
    }
  }

  // Export operations
  async saveExport(planId: string, filename: string, content: string): Promise<string> {
    const exportPath = path.join(this.plansDir, planId, 'exports', filename);
    await fs.writeFile(exportPath, content, 'utf-8');
    return exportPath;
  }

  // Helper to get plan directory path
  getPlanDir(planId: string): string {
    return path.join(this.plansDir, planId);
  }

  // Get base directory
  getBaseDir(): string {
    return this.baseDir;
  }

  // Sprint 7: Generic JSON read/write operations for version history
  async readJSON<T>(relativePath: string): Promise<T> {
    const fullPath = path.join(this.plansDir, relativePath);
    const content = await fs.readFile(fullPath, 'utf-8');
    return JSON.parse(content) as T;
  }

  async writeJSON(relativePath: string, data: unknown): Promise<void> {
    const fullPath = path.join(this.plansDir, relativePath);
    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await this.atomicWrite(fullPath, data);
  }

  async deleteFile(relativePath: string): Promise<void> {
    const fullPath = path.join(this.plansDir, relativePath);
    await fs.unlink(fullPath);
  }
}

export default FileStorage;
