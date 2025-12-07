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
 * @example
 * ```ts
 * const result = await bulkUpdateEntities({
 *   entityType: 'requirements',
 *   entityIdField: 'requirementId',
 *   updateFn: (id, updates) => this.updateRequirement({ planId, requirementId: id, updates }),
 *   planId,
 *   updates,
 *   atomic,
 *   storage: this.storage
 * });
 * ```
 */
export async function bulkUpdateEntities<TIdField extends string>(
  config: BulkUpdateConfig<TIdField>
): Promise<BulkUpdateResult<TIdField>> {
  const { entityType, entityIdField, updateFn, planId, updates, atomic = false, storage } = config;

  const results: Array<Record<TIdField, string> & { success: boolean; error?: string }> = [];
  let updated = 0;
  let failed = 0;

  // Atomic mode: validate all entities exist first
  if (atomic && storage) {
    const entities = await storage.loadEntities(planId, entityType);
    const entityMap = new Map(entities.map((e) => [e.id, e]));

    for (const update of updates) {
      const entityId = update[entityIdField];
      if (!entityMap.has(entityId)) {
        throw new Error(
          `${entityType.slice(0, -1)} ${entityId} not found (atomic mode - rolling back)`
        );
      }
    }

    // All validated - perform updates
    for (const update of updates) {
      const entityId = update[entityIdField];
      try {
        await updateFn(entityId, update.updates);
        results.push({ [entityIdField]: entityId, success: true } as any);
        updated++;
      } catch (error: any) {
        // In atomic mode, if any update fails, throw
        throw new Error(`Atomic bulk update failed: ${error.message}`);
      }
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
