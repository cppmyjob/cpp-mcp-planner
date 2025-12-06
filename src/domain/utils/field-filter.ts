/**
 * Field filtering utility for controlling entity payload size.
 * Supports 3 modes:
 * - Custom: specific fields only (e.g., ['id', 'title'])
 * - Summary: default essential fields (e.g., id, title, status...)
 * - Full: all fields when fields=['*']
 *
 * Also supports excluding metadata and computed fields:
 * - excludeMetadata: removes createdAt, updatedAt, version, metadata
 * - excludeComputed: removes computed fields like depth, path, childCount (for phases)
 */

import type { EntityType } from '../entities/types.js';

/**
 * Metadata fields present in all entities.
 * These fields occupy ~162 bytes per entity and are often not needed.
 */
export const METADATA_FIELDS = ['createdAt', 'updatedAt', 'version', 'metadata', 'type'];

/**
 * Computed fields for phase entities.
 * These fields are calculated dynamically and occupy ~50 bytes.
 */
export const COMPUTED_FIELDS = ['depth', 'path', 'childCount'];

/**
 * Summary field presets for each entity type.
 * These are the essential fields returned by default to minimize payload.
 */
export const SUMMARY_FIELDS: Record<EntityType, string[]> = {
  requirement: ['id', 'title', 'description', 'priority', 'category', 'status', 'votes'],
  solution: ['id', 'title', 'description', 'status', 'addressing'],
  decision: ['id', 'title', 'question', 'decision', 'context', 'consequences', 'status'],
  phase: ['id', 'title', 'status', 'progress', 'path', 'priority', 'parentId', 'order', 'depth', 'childCount', 'startedAt', 'completedAt', 'blockingReason'],
  artifact: ['id', 'title', 'slug', 'artifactType', 'status', 'description', 'content', 'fileTable', 'targets', 'relatedPhaseId', 'relatedSolutionId', 'relatedRequirementIds', 'codeRefs'],
};

/**
 * Filter an entity object to include only specified fields.
 *
 * @param entity - The entity to filter
 * @param fields - Array of field names to include, or ['*'] for all fields
 * @param entityType - Type of entity for summary field defaults
 * @param excludeMetadata - If true, exclude metadata fields (createdAt, updatedAt, version, metadata)
 * @param excludeComputed - If true, exclude computed fields (depth, path, childCount for phases)
 * @returns Filtered entity with only requested fields
 *
 * @example
 * // Minimal mode - custom fields only
 * filterEntity(requirement, ['id', 'title'], 'requirement')
 * // Returns: { id: '...', title: '...' }
 *
 * @example
 * // Summary mode - default (no fields parameter)
 * filterEntity(requirement, undefined, 'requirement')
 * // Returns: { id, title, description, priority, category, status, votes }
 *
 * @example
 * // Full mode - all fields
 * filterEntity(requirement, ['*'], 'requirement')
 * // Returns: entire requirement object
 *
 * @example
 * // Exclude metadata fields
 * filterEntity(requirement, undefined, 'requirement', true, false)
 * // Returns: summary fields WITHOUT createdAt, updatedAt, version, metadata
 *
 * @example
 * // Custom fields only (specific selection)
 * filterEntity(requirement, ['rationale', 'impact'], 'requirement')
 * // Returns: ONLY rationale + impact
 */
export function filterEntity<T>(
  entity: T,
  fields: string[] | undefined,
  entityType: EntityType,
  excludeMetadata: boolean = false,
  excludeComputed: boolean = false
): T | Partial<T> {
  // Determine which fields to include
  let filtered: Partial<T>;
  const entityObj = entity as Record<string, unknown>;

  if (fields && fields.includes('*')) {
    // Full mode: include all fields
    filtered = { ...entity };
  } else {
    // Determine which fields to include
    let fieldsToInclude: string[];

    if (!fields || fields.length === 0) {
      // Summary mode: use default summary fields
      fieldsToInclude = SUMMARY_FIELDS[entityType];
    } else {
      // Custom mode: ONLY use requested fields (no summary addition)
      fieldsToInclude = fields;
    }

    // Filter entity to include only specified fields
    filtered = {};
    for (const field of fieldsToInclude) {
      if (field in entityObj) {
        (filtered as Record<string, unknown>)[field] = entityObj[field];
      }
    }
  }

  // Apply exclusions AFTER field filtering
  const filteredObj = filtered as Record<string, unknown>;

  // Exclude metadata fields if requested
  if (excludeMetadata) {
    for (const metadataField of METADATA_FIELDS) {
      delete filteredObj[metadataField];
    }
  }

  // Exclude computed fields if requested (only for phases)
  if (excludeComputed && entityType === 'phase') {
    for (const computedField of COMPUTED_FIELDS) {
      delete filteredObj[computedField];
    }
  }

  return filtered as T;
}

/**
 * Filter an array of entities.
 *
 * @param entities - Array of entities to filter
 * @param fields - Array of field names to include, or ['*'] for all fields
 * @param entityType - Type of entities for summary field defaults
 * @param excludeMetadata - If true, exclude metadata fields
 * @param excludeComputed - If true, exclude computed fields (for phases)
 * @returns Array of filtered entities
 */
export function filterEntities<T>(
  entities: T[],
  fields: string[] | undefined,
  entityType: EntityType,
  excludeMetadata: boolean = false,
  excludeComputed: boolean = false
): Array<T | Partial<T>> {
  return entities.map((entity) =>
    filterEntity(entity, fields, entityType, excludeMetadata, excludeComputed)
  );
}

/**
 * Special handling for artifact sourceCode field.
 * sourceCode should NEVER be included in list operations, even with fields=['*'].
 * It should only be included in get operations when explicitly requested.
 *
 * @param artifact - The artifact to filter
 * @param fields - Array of field names
 * @param isListOperation - Whether this is a list operation (vs get)
 * @param excludeMetadata - If true, exclude metadata fields
 * @returns Filtered artifact with sourceCode handling
 */
export function filterArtifact<T>(
  artifact: T,
  fields: string[] | undefined,
  isListOperation: boolean,
  excludeMetadata: boolean = false
): T | Partial<T> {
  const filtered = filterEntity(artifact, fields, 'artifact', excludeMetadata, false);
  const filteredObj = filtered as Record<string, unknown>;

  // Remove sourceCode from list operations
  if (isListOperation && filteredObj.content) {
    const content = filteredObj.content as Record<string, unknown>;
    if ('sourceCode' in content) {
      const { sourceCode, ...restContent } = content;
      filteredObj.content = restContent;
    }
  }

  // Remove sourceCode from get operations unless in full mode
  if (!isListOperation && filteredObj.content && (!fields || !fields.includes('*'))) {
    const content = filteredObj.content as Record<string, unknown>;
    if ('sourceCode' in content) {
      const { sourceCode, ...restContent } = content;
      filteredObj.content = restContent;
    }
  }

  return filtered;
}
