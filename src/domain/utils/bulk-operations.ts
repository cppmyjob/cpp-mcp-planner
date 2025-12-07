/**
 * Sprint 9 REFACTOR: Common utilities for bulk update operations
 * Extracted from requirement-service, phase-service, solution-service
 */

export interface BulkUpdateConfig<TIdField extends string> {
  entityType: string;
  entityIdField: TIdField;
  updateFn: (entityId: string, updates: any) => Promise<void>;
  planId: string;
  updates: Array<Record<TIdField, string> & { updates: any }>;
  atomic?: boolean;
  storage?: {
    loadEntities: (planId: string, entityType: string) => Promise<Array<{ id: string }>>;
    saveEntities: (planId: string, entityType: string, entities: any[]) => Promise<void>;
  };
}

export interface BulkUpdateResult<TIdField extends string> {
  updated: number;
  failed: number;
  results: Array<Record<TIdField, string> & {
    success: boolean;
    error?: string;
  }>;
}

/**
 * Generic bulk update handler with atomic/non-atomic modes
 *
 * @param config Configuration for bulk update operation
 * @returns Result with success/error for each update
 *
 * ATOMIC MODE IMPLEMENTATION:
 * Uses snapshot/rollback pattern to ensure true atomicity:
 * 1. Load current state and create deep copy (snapshot)
 * 2. Validate all entity IDs exist
 * 3. Execute updates sequentially (each saves to disk immediately)
 * 4. If any update fails, restore snapshot via saveEntities (rollback)
 *
 * This ensures that either ALL updates succeed or NONE persist.
 * Trade-off: requires extra I/O for snapshot and potential rollback.
 *
 * @example
 * ```ts
 * const result = await bulkUpdateEntities({
 *   entityType: 'requirements',
 *   entityIdField: 'requirementId',
 *   updateFn: (id, updates) => this.updateRequirement({ planId, requirementId: id, updates }),
 *   planId,
 *   updates,
 *   atomic: true,
 *   storage: this.storage
 * });
 * ```
 */
export async function bulkUpdateEntities<TIdField extends string>(
  config: BulkUpdateConfig<TIdField>
): Promise<BulkUpdateResult<TIdField>> {
  const { entityType, entityIdField, updateFn, planId, updates, atomic = false, storage } = config;

  // API contract validation: atomic mode requires storage for snapshot/rollback
  if (atomic && !storage) {
    throw new Error('storage is required for atomic mode (needed for snapshot/rollback)');
  }

  const results: Array<Record<TIdField, string> & { success: boolean; error?: string }> = [];
  let updated = 0;
  let failed = 0;

  // Atomic mode: validate all entities exist first, then execute with rollback capability
  if (atomic && storage) {
    // BUGFIX: Create snapshot BEFORE any modifications for atomic rollback
    const currentEntities = await storage.loadEntities(planId, entityType);
    const snapshot = JSON.parse(JSON.stringify(currentEntities));
    const entityMap = new Map(currentEntities.map((e) => [e.id, e]));

    // Pre-validate: check all entities exist
    for (const update of updates) {
      const entityId = update[entityIdField];
      if (!entityMap.has(entityId)) {
        throw new Error(
          `${entityType.slice(0, -1)} ${entityId} not found (atomic mode - rolling back)`
        );
      }
    }

    // Execute updates sequentially with rollback on failure
    try {
      for (const update of updates) {
        const entityId = update[entityIdField];
        // Each updateFn call saves to disk immediately
        await updateFn(entityId, update.updates);
        results.push({ [entityIdField]: entityId, success: true } as any);
        updated++;
      }
    } catch (error: any) {
      // CRITICAL: Rollback all changes by restoring snapshot
      await storage.saveEntities(planId, entityType, snapshot);
      throw new Error(`Atomic bulk update failed: ${error.message} (rolled back all changes)`);
    }
  } else {
    // Non-atomic mode: process each update independently
    for (const update of updates) {
      const entityId = update[entityIdField];
      try {
        await updateFn(entityId, update.updates);
        results.push({ [entityIdField]: entityId, success: true } as any);
        updated++;
      } catch (error: any) {
        results.push({
          [entityIdField]: entityId,
          success: false,
          error: error.message,
        } as any);
        failed++;
      }
    }
  }

  return { updated, failed, results };
}
