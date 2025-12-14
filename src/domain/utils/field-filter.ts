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
import { ValidationError } from '../repositories/errors.js';

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
 * All valid fields for each entity type.
 * Used for field validation (BUG-040 fix) and backward compatibility.
 */
const VALID_REQUIREMENT_FIELDS = new Set([
  'id', 'type', 'createdAt', 'updatedAt', 'version', 'metadata',
  'title', 'description', 'rationale', 'category', 'priority', 'status',
  'acceptanceCriteria', 'impact', 'source', 'votes',
]);

const VALID_SOLUTION_FIELDS = new Set([
  'id', 'type', 'createdAt', 'updatedAt', 'version', 'metadata',
  'title', 'description', 'approach', 'addressing', 'tradeoffs',
  'evaluation', 'implementationNotes', 'status', 'selectionReason',
]);

const VALID_DECISION_FIELDS = new Set([
  'id', 'type', 'createdAt', 'updatedAt', 'version', 'metadata',
  'title', 'question', 'context', 'decision', 'consequences',
  'alternativesConsidered', 'impactScope', 'status', 'supersedes',
  'supersededBy',
]);

const VALID_PHASE_FIELDS = new Set([
  'id', 'type', 'createdAt', 'updatedAt', 'version', 'metadata',
  'title', 'description', 'parentId', 'order', 'depth', 'path',
  'objectives', 'deliverables', 'successCriteria', 'schedule',
  'status', 'progress', 'startedAt', 'completedAt',
  'milestones', 'blockers', 'blockingReason', 'implementationNotes', 'priority',
  'childCount', // computed field
]);

const VALID_ARTIFACT_FIELDS = new Set([
  'id', 'type', 'createdAt', 'updatedAt', 'version', 'metadata',
  'title', 'slug', 'description', 'artifactType', 'status',
  'content', 'targets', 'fileTable', 'codeRefs', // fileTable is deprecated but kept for backward compatibility
  'relatedPhaseId', 'relatedSolutionId', 'relatedRequirementIds',
]);

/**
 * Map of entity types to their valid fields.
 */
const VALID_FIELDS: Record<EntityType, Set<string>> = {
  requirement: VALID_REQUIREMENT_FIELDS,
  solution: VALID_SOLUTION_FIELDS,
  decision: VALID_DECISION_FIELDS,
  phase: VALID_PHASE_FIELDS,
  artifact: VALID_ARTIFACT_FIELDS,
};

/**
 * Summary field presets for each entity type.
 * These are the essential fields returned by default to minimize payload.
 */
export const SUMMARY_FIELDS: Record<EntityType, string[]> = {
  requirement: ['id', 'title', 'description', 'priority', 'category', 'status', 'votes'],
  solution: ['id', 'title', 'description', 'status', 'addressing'],
  decision: ['id', 'title', 'question', 'decision', 'context', 'consequences', 'status'],
  phase: ['id', 'title', 'status', 'progress', 'path', 'priority', 'parentId', 'order', 'depth', 'childCount', 'startedAt', 'completedAt', 'blockingReason'],
  artifact: ['id', 'title', 'slug', 'artifactType', 'status', 'description', 'content', 'targets', 'relatedPhaseId', 'relatedSolutionId', 'relatedRequirementIds', 'codeRefs'],
};

/**
 * BUG-040 FIX: Validate that requested fields are valid for the entity type.
 * Throws ValidationError if any invalid fields are requested.
 *
 * @param fields - Array of field names to validate
 * @param entityType - Type of entity
 * @throws ValidationError if any fields are invalid
 */
function validateFields(fields: string[], entityType: EntityType): void {
  const validFields = VALID_FIELDS[entityType];
  const invalidFields = fields.filter((field) => !validFields.has(field));

  if (invalidFields.length > 0) {
    throw new ValidationError(
      `Invalid field(s) for ${entityType}: ${invalidFields.join(', ')}. ` +
        `Valid fields: ${Array.from(validFields).join(', ')}`
    );
  }
}

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
  excludeMetadata = false,
  excludeComputed = false
): T | Partial<T> {
  // BUG-040 FIX: Validate custom fields before filtering
  // Only validate when fields are explicitly provided (not undefined, not empty, not ['*'])
  if (fields !== undefined && fields.length > 0 && !fields.includes('*')) {
    validateFields(fields, entityType);
  }

  // Determine which fields to include
  let filtered: Partial<T>;
  const entityObj = entity as Record<string, unknown>;

  if (fields?.includes('*') === true) {
    // Full mode: include all fields
    filtered = { ...entity };
  } else {
    // Determine which fields to include
    let fieldsToInclude: string[];

    if (!fields || fields.length === 0) {
      // Summary mode: use summary fields + metadata fields (metadata removed later if excludeMetadata=true)
      fieldsToInclude = [...SUMMARY_FIELDS[entityType], ...METADATA_FIELDS];
    } else {
      // Custom mode: ONLY use requested fields (no automatic additions)
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
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing fields from runtime object
      delete filteredObj[metadataField];
    }
  }

  // Exclude computed fields if requested (only for phases)
  if (excludeComputed && entityType === 'phase') {
    for (const computedField of COMPUTED_FIELDS) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing fields from runtime object
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
  excludeMetadata = false,
  excludeComputed = false
): (T | Partial<T>)[] {
  return entities.map((entity) =>
    filterEntity(entity, fields, entityType, excludeMetadata, excludeComputed)
  );
}

/**
 * Special handling for artifact sourceCode field with Lazy-Load support.
 * sourceCode should NEVER be included in list operations, even with includeContent=true (security).
 * For get operations, sourceCode is included only when includeContent=true (default: false).
 *
 * @param artifact - The artifact to filter
 * @param fields - Array of field names
 * @param isListOperation - Whether this is a list operation (vs get)
 * @param excludeMetadata - If true, exclude metadata fields
 * @param includeContent - If true, include sourceCode (default: false). IGNORED for list operations.
 * @returns Filtered artifact with sourceCode handling
 */
export function filterArtifact<T>(
  artifact: T,
  fields: string[] | undefined,
  isListOperation: boolean,
  excludeMetadata = false,
  includeContent = false
): T | Partial<T> {
  const filtered = filterEntity(artifact, fields, 'artifact', excludeMetadata, false);
  const filteredObj = filtered as Record<string, unknown>;

  // FIX #2: includeContent has priority (Variant B - explicit security control)
  // includeContent explicitly controls sourceCode inclusion for security/performance
  // fields=['*'] loads all fields, BUT sourceCode still requires explicit includeContent=true

  // Lazy-Load logic: Remove sourceCode UNLESS includeContent=true
  // For list operations, ALWAYS remove sourceCode (security: even with includeContent=true)
  const shouldRemoveSourceCode = isListOperation || !includeContent;

  if (shouldRemoveSourceCode && filteredObj.content !== undefined && filteredObj.content !== null) {
    const content = filteredObj.content as Record<string, unknown>;
    if ('sourceCode' in content) {
      const { sourceCode: excludedSourceCode, ...restContent } = content;
      void excludedSourceCode; // Excluded for security/performance
      filteredObj.content = restContent;
    }
  }

  return filtered;
}

/**
 * Filter phase entity with standard field filtering.
 * IMPORTANT: Enforces schema validation - only valid Phase fields are returned.
 *
 * @param phase - The phase to filter
 * @param fields - Array of field names
 * @param excludeMetadata - If true, exclude metadata fields
 * @param excludeComputed - If true, exclude computed fields (depth, path, childCount)
 * @returns Filtered phase (only valid fields, legacy fields removed)
 */
export function filterPhase<T>(
  phase: T,
  fields: string[] | undefined,
  excludeMetadata = false,
  excludeComputed = false
): T | Partial<T> {
  const filtered = filterEntity(phase, fields, 'phase', excludeMetadata, excludeComputed);
  const filteredObj = filtered as Record<string, unknown>;

  // Backward compatibility: Remove any fields not in current Phase schema
  // This handles legacy data that may contain deprecated fields
  for (const key of Object.keys(filteredObj)) {
    if (!VALID_PHASE_FIELDS.has(key)) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- removing invalid fields from runtime object
      delete filteredObj[key];
    }
  }

  return filtered;
}
