/**
 * Common validation functions for entity fields
 */

const VALID_EFFORT_UNITS = ['minutes', 'hours', 'days', 'weeks', 'story-points'] as const;
const VALID_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
const VALID_ARTIFACT_TYPES = ['code', 'config', 'migration', 'documentation', 'test', 'script', 'other'] as const;
const VALID_FILE_ACTIONS = ['create', 'modify', 'delete'] as const;

export function validateEffortEstimate(effort: unknown, fieldName = 'effortEstimate'): void {
  if (effort === undefined || effort === null) {
    return; // Optional field
  }

  const e = effort as Record<string, unknown>;

  // Check for invalid legacy format { hours: X, complexity: Y }
  if ('hours' in e || 'complexity' in e) {
    throw new Error(
      `Invalid ${fieldName} format: found legacy { hours, complexity } format. ` +
      `Expected { value: number, unit: 'minutes'|'hours'|'days'|'weeks'|'story-points', confidence: 'low'|'medium'|'high' }`
    );
  }

  // Validate required fields
  if (typeof e.value !== 'number') {
    throw new Error(`Invalid ${fieldName}: 'value' must be a number`);
  }

  // Sprint 2: Validate value is non-negative
  if (e.value < 0) {
    throw new Error(`${fieldName}.value must be >= 0`);
  }

  if (!VALID_EFFORT_UNITS.includes(e.unit as typeof VALID_EFFORT_UNITS[number])) {
    throw new Error(
      `Invalid ${fieldName}: 'unit' must be one of: ${VALID_EFFORT_UNITS.join(', ')}`
    );
  }

  if (!VALID_CONFIDENCE_LEVELS.includes(e.confidence as typeof VALID_CONFIDENCE_LEVELS[number])) {
    throw new Error(
      `Invalid ${fieldName}: 'confidence' must be one of: ${VALID_CONFIDENCE_LEVELS.join(', ')}`
    );
  }
}

export function validateAlternativesConsidered(alternatives: unknown[]): void {
  if (!Array.isArray(alternatives)) {
    return;
  }

  for (let i = 0; i < alternatives.length; i++) {
    const alt = alternatives[i] as Record<string, unknown>;

    if (typeof alt.option !== 'string' || alt.option === '') {
      throw new Error(
        `Invalid alternativesConsidered at index ${String(i)}: 'option' must be a non-empty string`
      );
    }

    if (typeof alt.reasoning !== 'string' || alt.reasoning === '') {
      throw new Error(
        `Invalid alternativesConsidered at index ${String(i)}: 'reasoning' must be a non-empty string`
      );
    }
  }
}

export function validateTags(tags: unknown[]): void {
  if (!Array.isArray(tags)) {
    return;
  }

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i] as Record<string, unknown>;

    if (typeof tag.key !== 'string' || tag.key === '') {
      throw new Error(
        `Invalid tag at index ${String(i)}: 'key' must be a non-empty string`
      );
    }

    if (typeof tag.value !== 'string') {
      throw new Error(
        `Invalid tag at index ${String(i)}: 'value' must be a string`
      );
    }
  }
}

export function validateCodeExamples(examples: unknown[]): void {
  if (!Array.isArray(examples)) {
    return;
  }

  for (let i = 0; i < examples.length; i++) {
    const ex = examples[i] as Record<string, unknown>;

    if (typeof ex.language !== 'string' || ex.language === '') {
      throw new Error(
        `Invalid codeExample at index ${String(i)}: 'language' must be a non-empty string`
      );
    }

    if (typeof ex.code !== 'string') {
      throw new Error(
        `Invalid codeExample at index ${String(i)}: 'code' must be a string`
      );
    }
  }
}

export function validateArtifactType(artifactType: unknown): void {
  if (!VALID_ARTIFACT_TYPES.includes(artifactType as typeof VALID_ARTIFACT_TYPES[number])) {
    throw new Error(
      `Invalid artifactType: must be one of: ${VALID_ARTIFACT_TYPES.join(', ')}`
    );
  }
}

/**
 * Validates ArtifactTarget array.
 * Replaces validateFileTable with additional precision fields (lineNumber, lineEnd, searchPattern).
 */
export function validateTargets(targets: unknown[]): void {
  // targets is unknown[], so it's already an array
  if (!Array.isArray(targets)) {
    return;
  }

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i] as Record<string, unknown>;

    // Validate path - must be non-empty string (after trimming)
    if (typeof target.path !== 'string') {
      throw new Error(
        `Invalid target at index ${String(i)}: path must be a non-empty string`
      );
    }

    const trimmedPath = target.path.trim();
    if (trimmedPath === '') {
      throw new Error(
        `Invalid target at index ${String(i)}: path must be a non-empty string`
      );
    }

    // Validate action
    if (!VALID_FILE_ACTIONS.includes(target.action as typeof VALID_FILE_ACTIONS[number])) {
      throw new Error(
        `Invalid target at index ${String(i)}: action must be one of: ${VALID_FILE_ACTIONS.join(', ')}`
      );
    }

    // Validate lineNumber (optional)
    if (target.lineNumber !== undefined) {
      if (typeof target.lineNumber !== 'number') {
        throw new Error(
          `Invalid target at index ${String(i)}: lineNumber must be a number`
        );
      }

      if (!Number.isInteger(target.lineNumber)) {
        throw new Error(
          `Invalid target at index ${String(i)}: lineNumber must be an integer`
        );
      }

      if (target.lineNumber < 1) {
        throw new Error(
          `Invalid target at index ${String(i)}: lineNumber must be a positive integer`
        );
      }
    }

    // Validate lineEnd (optional, requires lineNumber)
    if (target.lineEnd !== undefined) {
      if (target.lineNumber === undefined) {
        throw new Error(
          `Invalid target at index ${String(i)}: lineEnd requires lineNumber`
        );
      }

      if (typeof target.lineEnd !== 'number') {
        throw new Error(
          `Invalid target at index ${String(i)}: lineEnd must be a number`
        );
      }

      if (!Number.isInteger(target.lineEnd)) {
        throw new Error(
          `Invalid target at index ${String(i)}: lineEnd must be an integer`
        );
      }

      if (target.lineEnd < (target.lineNumber)) {
        throw new Error(
          `Invalid target at index ${String(i)}: lineEnd must be >= lineNumber`
        );
      }
    }

    // Validate searchPattern (optional, conflicts with lineNumber)
    if (target.searchPattern !== undefined) {
      if (target.lineNumber !== undefined) {
        throw new Error(
          `Invalid target at index ${String(i)}: cannot use both lineNumber and searchPattern`
        );
      }

      if (typeof target.searchPattern !== 'string') {
        throw new Error(
          `Invalid target at index ${String(i)}: searchPattern must be a non-empty string`
        );
      }

      if (target.searchPattern === '') {
        throw new Error(
          `Invalid target at index ${String(i)}: searchPattern must be a non-empty string`
        );
      }

      // Validate regex syntax
      try {
        new RegExp(target.searchPattern);
      } catch {
        throw new Error(
          `Invalid target at index ${String(i)}: invalid regex in searchPattern`
        );
      }
    }

    // description is optional and can be any string (including empty)
  }
}

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

/**
 * Validates code references array.
 * Format: "file_path:line_number" (e.g., "src/file.ts:42")
 * Supports Windows paths with drive letters (e.g., "D:\\path\\file.ts:42")
 */
export function validateCodeRefs(codeRefs: unknown[]): void {
  if (!Array.isArray(codeRefs)) {
    return;
  }

  for (let i = 0; i < codeRefs.length; i++) {
    const ref = codeRefs[i];

    if (typeof ref !== 'string') {
      throw new Error(
        `Invalid codeRef at index ${String(i)}: must be a string`
      );
    }

    if (ref === '') {
      throw new Error(
        `Invalid codeRef at index ${String(i)}: cannot be empty`
      );
    }

    // Find the last colon - line number comes after it
    const lastColonIndex = ref.lastIndexOf(':');

    if (lastColonIndex === -1) {
      throw new Error(
        `Invalid codeRef at index ${String(i)}: must be in format 'file_path:line_number' (e.g., 'src/file.ts:42')`
      );
    }

    const lineNumberStr = ref.slice(lastColonIndex + 1);
    const lineNumber = parseInt(lineNumberStr, 10);

    // Check if it's a positive integer
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumberStr !== String(lineNumber)) {
      throw new Error(
        `Invalid codeRef at index ${String(i)}: line number must be a positive integer (got '${lineNumberStr}')`
      );
    }
  }
}

export function validatePriority(priority: unknown): void {
  if (priority === undefined) {
    return; // Optional field
  }

  if (typeof priority !== 'string') {
    throw new Error('Invalid priority: must be a string');
  }

  if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
    throw new Error(
      `Invalid priority '${priority}': must be one of: ${VALID_PRIORITIES.join(', ')}`
    );
  }
}

/**
 * Validates that a value is a non-empty string (for REQUIRED fields)
 * @param value - The value to validate
 * @param fieldName - The name of the field for error messages
 * @throws Error if value is undefined, null, not a string, or empty/whitespace-only
 */
export function validateRequiredString(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) {
    throw new Error(`${fieldName} is required`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (value.trim() === '') {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
}

/**
 * Validates that a value is one of the valid enum values (for REQUIRED enum fields)
 * @param value - The value to validate
 * @param fieldName - The name of the field for error messages
 * @param validValues - Array of valid enum values
 * @throws Error if value is undefined, null, not a string, or not in validValues
 */
export function validateRequiredEnum(
  value: unknown,
  fieldName: string,
  validValues: readonly string[]
): void {
  if (value === undefined || value === null) {
    throw new Error(`${fieldName} is required`);
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  if (!validValues.includes(value)) {
    throw new Error(`${fieldName} must be one of: ${validValues.join(', ')}`);
  }
}

// Sprint 1: Plan validation constants and functions
const VALID_PLAN_STATUSES = ['active', 'archived', 'completed'] as const;

/**
 * Validates plan name - must be a non-empty string (after trimming whitespace)
 * @param name - The plan name to validate
 * @throws Error if name is undefined, null, not a string, or empty/whitespace-only
 */
export function validatePlanName(name: unknown): void {
  validateRequiredString(name, 'name');
}

/**
 * Validates plan status - must be one of: active, archived, completed
 * Only validates if status is provided (optional field on update)
 * @param status - The plan status to validate
 * @throws Error if status is provided but not a valid value
 */
export function validatePlanStatus(status: unknown): void {
  if (status === undefined) {
    return; // Optional field on update
  }

  if (typeof status !== 'string') {
    throw new Error('status must be a string');
  }

  if (!VALID_PLAN_STATUSES.includes(status as typeof VALID_PLAN_STATUSES[number])) {
    throw new Error(`status must be one of: ${VALID_PLAN_STATUSES.join(', ')}`);
  }
}

// Sprint 2: Progress validation constants
const PROGRESS_MIN = 0;
const PROGRESS_MAX = 100;

/**
 * Validates progress value - must be between 0 and 100 (inclusive)
 * Only validates if progress is provided (optional field)
 * @param progress - The progress value to validate
 * @throws Error if progress is provided but not within 0-100 range
 */
export function validateProgress(progress: unknown): void {
  if (progress === undefined) {
    return; // Optional field
  }

  if (typeof progress !== 'number') {
    throw new Error('progress must be a number');
  }

  if (progress < PROGRESS_MIN || progress > PROGRESS_MAX) {
    throw new Error(`progress must be between ${String(PROGRESS_MIN)} and ${String(PROGRESS_MAX)}`);
  }
}

// Sprint 6: Slug validation constants
const SLUG_MAX_LENGTH = 100;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates artifact slug format.
 * Slug must be lowercase alphanumeric with dashes, max 100 chars.
 * Cannot start or end with dash, cannot have consecutive dashes.
 * @param slug - The slug value to validate
 * @throws Error if slug format is invalid
 */
export function validateSlug(slug: unknown): void {
  // Optional field - skip if undefined
  if (slug === undefined) {
    return;
  }

  // Must be a string
  if (typeof slug !== 'string') {
    throw new Error('slug must be a string');
  }

  // Must not be empty
  if (slug === '') {
    throw new Error('slug must be a non-empty string');
  }

  // Check max length
  if (slug.length > SLUG_MAX_LENGTH) {
    throw new Error(`slug must not exceed ${String(SLUG_MAX_LENGTH)} characters`);
  }

  // Check for leading/trailing dashes first (more specific error)
  if (slug.startsWith('-') || slug.endsWith('-')) {
    throw new Error('slug cannot start or end with a dash');
  }

  // Check for consecutive dashes (more specific error)
  if (slug.includes('--')) {
    throw new Error('slug cannot contain consecutive dashes');
  }

  // Check overall format (lowercase alphanumeric with single dashes)
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      'slug must be lowercase alphanumeric with dashes (e.g., "my-valid-slug-123")'
    );
  }
}
