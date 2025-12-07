import type { FileStorage } from '../../infrastructure/file-storage.js';
import type {
  VersionHistory,
  VersionSnapshot,
  VersionDiff,
  Requirement,
  Solution,
  Phase,
  Decision,
  Artifact,
  PlanManifest,
} from '../entities/types.js';

export type EntityType = 'requirement' | 'solution' | 'decision' | 'phase' | 'artifact';

export interface GetHistoryInput {
  planId: string;
  entityId: string;
  entityType: EntityType;
  limit?: number;
  offset?: number;
}

export interface DiffInput {
  planId: string;
  entityId: string;
  entityType: EntityType;
  version1: number;
  version2: number;
  currentEntityData?: any; // Optional: current entity data if version2 is the current version
  currentVersion?: number; // Optional: current version number
}

export class VersionHistoryService {
  constructor(private storage: FileStorage) {}

  /**
   * Check if version history is enabled for the plan
   */
  async isHistoryEnabled(planId: string): Promise<boolean> {
    const manifest = await this.storage.loadManifest(planId);
    return manifest.enableHistory === true;
  }

  /**
   * Get the maximum history depth for the plan
   */
  async getMaxHistoryDepth(planId: string): Promise<number> {
    const manifest = await this.storage.loadManifest(planId);
    return manifest.maxHistoryDepth ?? 0; // 0 means unlimited
  }

  /**
   * Save a version snapshot
   */
  async saveVersion<T>(
    planId: string,
    entityId: string,
    entityType: EntityType,
    data: T,
    version: number,
    author?: string,
    changeNote?: string
  ): Promise<void> {
    const enabled = await this.isHistoryEnabled(planId);
    if (!enabled) {
      return; // History disabled, skip
    }

    const maxDepth = await this.getMaxHistoryDepth(planId);
    const history = await this.loadHistory(planId, entityId, entityType);

    const snapshot: VersionSnapshot<T> = {
      version,
      data,
      timestamp: new Date().toISOString(),
      author,
      changeNote,
    };

    // Add new snapshot
    history.versions.push(snapshot);
    history.total = history.versions.length;
    history.currentVersion = version;  // Sprint 7 fix: Update currentVersion to latest

    // Apply rotation if maxDepth is set and exceeded
    if (maxDepth > 0 && history.versions.length > maxDepth) {
      const excess = history.versions.length - maxDepth;
      history.versions.splice(0, excess); // Remove oldest versions
    }

    await this.saveHistory(planId, entityId, entityType, history);
  }

  /**
   * Get version history for an entity
   * Note: Can retrieve existing history even if history is currently disabled
   */
  async getHistory(input: GetHistoryInput): Promise<VersionHistory> {
    // Validate offset
    const offset = input.offset ?? 0;
    if (offset < 0) {
      throw new Error('offset must be non-negative');
    }

    const history = await this.loadHistory(
      input.planId,
      input.entityId,
      input.entityType
    );

    // Reverse to show newest first (reverse chronological order)
    const reversedVersions = [...history.versions].reverse();

    // Apply pagination
    const limit = input.limit ?? 100;
    const paginatedVersions = reversedVersions.slice(offset, offset + limit);
    const hasMore = offset + paginatedVersions.length < history.total;

    return {
      ...history,
      versions: paginatedVersions,
      total: history.total,
      hasMore,
    };
  }

  /**
   * Compare two versions and generate diff
   * Note: Can compare versions even if history is currently disabled
   */
  async diff(input: DiffInput): Promise<VersionDiff> {
    const history = await this.loadHistory(
      input.planId,
      input.entityId,
      input.entityType
    );

    let v1 = history.versions.find((v) => v.version === input.version1);
    let v2 = history.versions.find((v) => v.version === input.version2);

    // If v1 not found in history and current entity data is provided
    if (!v1 && input.currentEntityData && input.currentVersion === input.version1) {
      v1 = {
        version: input.version1,
        data: input.currentEntityData,
        timestamp: new Date().toISOString(),
      };
    }

    // If v2 not found in history and current entity data is provided
    if (!v2 && input.currentEntityData && input.currentVersion === input.version2) {
      v2 = {
        version: input.version2,
        data: input.currentEntityData,
        timestamp: new Date().toISOString(),
      };
    }

    if (!v1) {
      throw new Error(`Version ${input.version1} not found`);
    }
    if (!v2) {
      throw new Error(`Version ${input.version2} not found`);
    }

    const changes: Record<string, { from: any; to: any; changed: boolean }> = {};

    // Metadata fields to exclude from diff (these always change on updates)
    // Note: lockVersion removed as it only exists on PlanManifest, not on entities
    const excludeFields = new Set(['updatedAt', 'version', 'createdAt']);

    // Get all unique keys from both versions
    const allKeys = new Set([
      ...Object.keys(v1.data),
      ...Object.keys(v2.data),
    ]);

    for (const key of allKeys) {
      // Skip metadata fields
      if (excludeFields.has(key)) {
        continue;
      }

      const fromValue = (v1.data as any)[key];
      const toValue = (v2.data as any)[key];

      // Deep comparison for objects and arrays
      const changed = JSON.stringify(fromValue) !== JSON.stringify(toValue);

      // Only include changed fields in the result
      if (changed) {
        changes[key] = {
          from: fromValue,
          to: toValue,
          changed: true,
        };
      }
    }

    return {
      entityId: input.entityId,
      entityType: input.entityType,
      version1: {
        version: input.version1,
        timestamp: v1.timestamp,
      },
      version2: {
        version: input.version2,
        timestamp: v2.timestamp,
      },
      changes,
    };
  }

  /**
   * Load version history from storage
   */
  private async loadHistory(
    planId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<VersionHistory> {
    const historyPath = this.getHistoryPath(planId, entityType, entityId);

    try {
      const history = await this.storage.readJSON<VersionHistory>(historyPath);
      return history;
    } catch {
      // History file doesn't exist, return empty
      return {
        entityId,
        entityType,
        currentVersion: 1,
        versions: [],
        total: 0,
      };
    }
  }

  /**
   * Save version history to storage
   */
  private async saveHistory(
    planId: string,
    entityId: string,
    entityType: EntityType,
    history: VersionHistory
  ): Promise<void> {
    const historyPath = this.getHistoryPath(planId, entityType, entityId);
    await this.storage.writeJSON(historyPath, history);
  }

  /**
   * Get the file path for version history
   */
  private getHistoryPath(planId: string, entityType: EntityType, entityId: string): string {
    return `${planId}/history/${entityType}/${entityId}.json`;
  }

  /**
   * Delete version history for an entity
   */
  async deleteHistory(
    planId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<void> {
    const historyPath = this.getHistoryPath(planId, entityType, entityId);
    try {
      await this.storage.deleteFile(historyPath);
    } catch {
      // File doesn't exist, ignore
    }
  }
}

export default VersionHistoryService;
