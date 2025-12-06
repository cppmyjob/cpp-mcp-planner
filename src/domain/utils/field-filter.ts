/**
 * Field filtering utility for controlling entity payload size.
 * Supports 3 modes:
 * - Custom: specific fields only (e.g., ['id', 'title'])
 * - Summary: default essential fields (e.g., id, title, status...)
 * - Full: all fields when fields=['*']
 */

import type { EntityType } from '../entities/types.js';

/**
 * Summary field presets for each entity type.
 * These are the essential fields returned by default to minimize payload.
 */
export const SUMMARY_FIELDS: Record<EntityType, string[]> = {
  requirement: ['id', 'title', 'description', 'priority', 'category', 'status', 'votes'],
  solution: ['id', 'title', 'description', 'status', 'addressing'],
  decision: ['id', 'title', 'question', 'decision', 'context', 'consequences', 'status'],
  phase: ['id', 'title', 'description', 'status', 'progress', 'path', 'priority', 'parentId', 'order', 'depth', 'objectives', 'deliverables', 'startedAt', 'completedAt', 'blockingReason', 'schedule'],
  artifact: ['id', 'title', 'slug', 'artifactType', 'status', 'description', 'content', 'fileTable', 'targets', 'relatedPhaseId', 'relatedSolutionId', 'relatedRequirementIds', 'codeRefs'],
};

/**
 * Filter an entity object to include only specified fields.
 *
 * @param entity - The entity to filter
 * @param fields - Array of field names to include, or ['*'] for all fields
 * @param entityType - Type of entity for summary field defaults
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
 * // Custom fields only (specific selection)
 * filterEntity(requirement, ['rationale', 'impact'], 'requirement')
 * // Returns: ONLY rationale + impact
 */
export function filterEntity<T>(
  entity: T,
  fields: string[] | undefined,
  entityType: EntityType
): T | Partial<T> {
  // Full mode: return entire entity
  if (fields && fields.includes('*')) {
    return entity;
  }

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
  const filtered: Partial<T> = {};
  const entityObj = entity as Record<string, unknown>;
  for (const field of fieldsToInclude) {
    if (field in entityObj) {
      (filtered as Record<string, unknown>)[field] = entityObj[field];
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
 * @returns Array of filtered entities
 */
export function filterEntities<T>(
  entities: T[],
  fields: string[] | undefined,
  entityType: EntityType
): Array<T | Partial<T>> {
  return entities.map((entity) => filterEntity(entity, fields, entityType));
}

/**
 * Special handling for artifact sourceCode field.
 * sourceCode should NEVER be included in list operations, even with fields=['*'].
 * It should only be included in get operations when explicitly requested.
 *
 * @param artifact - The artifact to filter
 * @param fields - Array of field names
 * @param isListOperation - Whether this is a list operation (vs get)
 * @returns Filtered artifact with sourceCode handling
 */
export function filterArtifact<T>(
  artifact: T,
  fields: string[] | undefined,
  isListOperation: boolean
): T | Partial<T> {
  const filtered = filterEntity(artifact, fields, 'artifact');
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
