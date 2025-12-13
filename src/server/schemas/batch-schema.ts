import { z } from 'zod';

const entityTypeSchema = z.enum(['requirement', 'solution', 'phase', 'link', 'decision', 'artifact']);

const operationSchema = z.object({
  entityType: entityTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export const batchSchema = z.object({
  planId: z.string(),
  operations: z.array(operationSchema),
});

export const batchToolDescription = 'Execute multiple planning operations atomically in a single transaction. All operations succeed together or all fail (rollback). Supports temp IDs ($0, $1, $2, ...) for referencing entities created within the same batch. Temp IDs are resolved to real UUIDs after entity creation. Supports both create and update operations - use action: "update" in payload with id and updates fields to update existing entities. Use batch for: creating complex dependency trees, bulk imports, bulk updates, setting up initial project structure. Actions: execute.';
