/**
 * Common validation functions for entity fields
 */

const VALID_EFFORT_UNITS = ['minutes', 'hours', 'days', 'weeks', 'story-points'] as const;
const VALID_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;
const VALID_ARTIFACT_TYPES = ['code', 'config', 'migration', 'documentation', 'test', 'script', 'other'] as const;
const VALID_FILE_ACTIONS = ['create', 'modify', 'delete'] as const;

/**
 * Sanitizes text input by rejecting dangerous characters.
 * Rejects: HTML tags (XSS), HTML entities, bidirectional override chars,
 * null bytes, control characters (except newline, tab, carriage return).
 * @param text - The text to sanitize
 * @param fieldName - Field name for error messages
 * @throws Error if dangerous content detected
 */
export function sanitizeText(text: string, fieldName: string): void {
  // Check for null bytes (BUG-029)
  if (text.includes('\0')) {
    throw new Error(`${fieldName} contains null bytes which are not allowed`);
  }

  // Check for HTML/Script tags (BUG-003 - XSS)
  const htmlTagPattern = /<[^>]*>/;
  if (htmlTagPattern.test(text)) {
    throw new Error(`${fieldName} contains HTML tags which are not allowed`);
  }

  // H-1 FIX: Check for HTML entities (&#60; &#x3C; etc.) - encoded XSS
  const htmlEntityPattern = /&#(x?[0-9a-fA-F]+|[0-9]+);/;
  if (htmlEntityPattern.test(text)) {
    throw new Error(`${fieldName} contains HTML entities which are not allowed`);
  }

  // H-1 FIX: Check for bidirectional override characters (visual spoofing attacks)
  // U+202A-U+202E: LRE, RLE, PDF, LRO, RLO
  // U+2066-U+2069: LRI, RLI, FSI, PDI
  const bidiPattern = /[\u202A-\u202E\u2066-\u2069]/;
  if (bidiPattern.test(text)) {
    throw new Error(`${fieldName} contains bidirectional override characters which are not allowed`);
  }

  // BUG-044 FIX: Check for zero-width characters (visual deception, string comparison issues)
  // U+200B: Zero Width Space (ZWSP)
  // U+200C: Zero Width Non-Joiner (ZWNJ)
  // U+200D: Zero Width Joiner (ZWJ)
  // U+FEFF: Zero Width No-Break Space (BOM)
  // eslint-disable-next-line no-misleading-character-class -- Unicode escape sequences are intentional
  const zeroWidthPattern = /[\u200B\u200C\u200D\uFEFF]/u;
  if (zeroWidthPattern.test(text)) {
    throw new Error(`${fieldName} contains zero-width characters which are not allowed`);
  }

  // Check for control characters (except newline, tab, carriage return)
  // Control characters are \x00-\x1F and \x7F-\x9F
  // Allow: \n (0x0A), \r (0x0D), \t (0x09)
  // eslint-disable-next-line no-control-regex
  const controlCharsPattern = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/;
  if (controlCharsPattern.test(text)) {
    throw new Error(`${fieldName} contains control characters which are not allowed`);
  }
}

/**
 * Sanitizes tag keys by rejecting dangerous characters and whitespace-only keys.
 * Rejects: null bytes, whitespace-only, control characters.
 * @param key - The tag key to sanitize
 * @param index - Array index for error messages
 * @throws Error if dangerous content detected
 */
export function sanitizeTagKey(key: string, index: number): void {
  // Check for null bytes (BUG-032)
  if (key.includes('\0')) {
    throw new Error(`Tag key at index ${String(index)} contains null bytes which are not allowed`);
  }

  // Check for whitespace-only (BUG-035)
  if (key.trim() === '') {
    throw new Error(`Tag key at index ${String(index)} must not be whitespace-only`);
  }

  // Check for control characters
  // eslint-disable-next-line no-control-regex
  const controlCharsPattern = /[\x00-\x1F\x7F-\x9F]/;
  if (controlCharsPattern.test(key)) {
    throw new Error(`Tag key at index ${String(index)} contains control characters which are not allowed`);
  }
}

/**
 * Sanitizes file paths by rejecting path traversal attempts.
 * Rejects: path traversal (../, ..\), URL-encoded traversal, absolute paths, null bytes.
 * @param path - The path to sanitize
 * @param fieldName - Field name for error messages
 * @throws Error if path traversal detected
 */
export function sanitizePath(path: string, fieldName: string): void {
  // Check for null bytes
  if (path.includes('\0')) {
    throw new Error(`${fieldName} contains null bytes which are not allowed`);
  }

  // Check for path traversal patterns (BUG-030)
  // Patterns: ../, ..\\, /../, /..\\, etc.
  const traversalPatterns = [
    '../',
    '..\\',
    '/../',
    '\\..\\',
    '/..',
    '\\..',
  ];

  for (const pattern of traversalPatterns) {
    if (path.includes(pattern)) {
      throw new Error(`${fieldName} contains path traversal sequence '${pattern}' which is not allowed`);
    }
  }

  // H-1 FIX: Check for URL-encoded path traversal (%2e%2e/, %252e%252e/, etc.)
  let decodedPath = path;
  try {
    decodedPath = decodeURIComponent(path);
    // Try double-decode for double-encoded attacks (%252e -> %2e -> .)
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      // Single encoding only - that's fine
    }
  } catch {
    // Invalid encoding - use raw path
    decodedPath = path;
  }

  // Check decoded path for traversal patterns
  for (const pattern of traversalPatterns) {
    if (decodedPath !== path && decodedPath.includes(pattern)) {
      throw new Error(`${fieldName} contains encoded path traversal which is not allowed`);
    }
  }

  // Reject absolute paths on Windows (C:, D:, etc.)
  if (/^[a-zA-Z]:/.test(path)) {
    throw new Error(`${fieldName} must be a relative path (absolute paths not allowed)`);
  }

  // Reject absolute paths on Unix (/path)
  if (path.startsWith('/')) {
    throw new Error(`${fieldName} must be a relative path (absolute paths not allowed)`);
  }
}

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
    throw new Error(`Invalid ${fieldName}: 'value' must be >= 0`);
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

    // Sanitize tag key (BUG-032, BUG-035)
    sanitizeTagKey(tag.key, i);

    if (typeof tag.value !== 'string') {
      throw new Error(
        `Invalid tag at index ${String(i)}: 'value' must be a string`
      );
    }

    // BUG-035 FIX: Reject whitespace-only tag values
    if (tag.value.trim() === '') {
      throw new Error(
        `Invalid tag at index ${String(i)}: 'value' must not be whitespace-only`
      );
    }

    // Sanitize tag value (BUG-003, BUG-029)
    sanitizeText(tag.value, `Tag value at index ${String(i)}`);
  }
}

// L-2 FIX: Removed unused validateCodeExamples function (Sprint 10 removed codeExamples field)

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

    // Sanitize path (BUG-030)
    sanitizePath(trimmedPath, `Target path at index ${String(i)}`);

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

      // H-1 FIX: Check for ReDoS vulnerable patterns before creating RegExp
      // Dangerous patterns: nested quantifiers like (a+)+, (a*)+, (a+)*, (a*)*, (.*){n}
      const redosPatterns = [
        /\([^)]*\+[^)]*\)\+/,   // (a+)+ - nested plus
        /\([^)]*\*[^)]*\)\+/,   // (a*)+ - star then plus
        /\([^)]*\+[^)]*\)\*/,   // (a+)* - plus then star
        /\([^)]*\*[^)]*\)\*/,   // (a*)* - nested star
        /\(\.\*[^)]*\)\{/,      // (.*){n} - dot-star with quantifier
      ];

      for (const redosPattern of redosPatterns) {
        if (redosPattern.test(target.searchPattern)) {
          throw new Error(
            `Invalid target at index ${String(i)}: searchPattern contains potentially dangerous regex pattern (ReDoS risk)`
          );
        }
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
  // Sanitize text content (BUG-003, BUG-029)
  sanitizeText(value, fieldName);
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

// Phase order validation constants (BUG-017, BUG-033, BUG-034, BUG-045)
const PHASE_ORDER_MIN = 1;
const PHASE_ORDER_MAX = 10000;

/**
 * Validates phase order value.
 * Order must be a positive integer between 1 and 10000.
 * Rejects: negative values, zero, floats, and values exceeding max limit.
 * @param order - The order value to validate
 * @param fieldName - Field name for error messages (default: 'order')
 * @throws Error if order is invalid
 */
export function validatePhaseOrder(order: unknown, fieldName = 'order'): void {
  // Optional field - skip if undefined
  if (order === undefined) {
    return;
  }

  // Must be a number
  if (typeof order !== 'number') {
    throw new Error(`${fieldName} must be a number`);
  }

  // Must be an integer (not float)
  if (!Number.isInteger(order)) {
    throw new Error(`${fieldName} must be an integer, got ${String(order)}`);
  }

  // Must be >= 1 (BUG-017: negative, BUG-034: zero)
  if (order < PHASE_ORDER_MIN) {
    throw new Error(`${fieldName} must be >= ${String(PHASE_ORDER_MIN)}, got ${String(order)}`);
  }

  // Must be <= max limit (BUG-045: huge values)
  if (order > PHASE_ORDER_MAX) {
    throw new Error(`${fieldName} must be <= ${String(PHASE_ORDER_MAX)}, got ${String(order)}`);
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

/**
 * Validates optional string field (like description, approach, context, etc.)
 * BUG-042 FIX: Rejects empty strings. Allows undefined/null, but if provided must be non-empty.
 * @param value - The optional string to validate
 * @param fieldName - Field name for error messages
 * @throws Error if value is empty string or contains dangerous content
 */
export function validateOptionalString(value: unknown, fieldName: string): void {
  if (value === undefined || value === null) {
    return; // Optional field
  }
  if (typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }
  // BUG-042 FIX: Reject empty strings for optional fields
  if (value === '') {
    throw new Error(`${fieldName} must be a non-empty string or undefined`);
  }
  // Sanitize non-empty values
  sanitizeText(value, fieldName);
}

// BUG-012: Text length limits
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_RATIONALE_LENGTH = 1000;

/**
 * Validates text length against maximum limit.
 * BUG-012 FIX: Enforces max length for title, description, rationale fields.
 * @param value - The text to validate
 * @param fieldName - Field name for error messages
 * @param maxLength - Maximum allowed length
 * @throws Error if value exceeds maxLength
 */
export function validateTextLength(value: string, fieldName: string, maxLength: number): void {
  if (value.length > maxLength) {
    throw new Error(
      `${fieldName} exceeds maximum length of ${String(maxLength)} characters (current: ${String(value.length)})`
    );
  }
}

/**
 * Validates list pagination parameters.
 * BUG-018 FIX: Rejects negative limit/offset values.
 * BUG-019 FIX: Rejects limit=0 (must be >= 1).
 * @param limit - Maximum number of items to return
 * @param offset - Number of items to skip
 * @throws Error if limit or offset is invalid
 */
export function validateListParams(limit?: number, offset?: number): void {
  if (limit !== undefined) {
    if (typeof limit !== 'number') {
      throw new Error('limit must be a number');
    }
    // BUG-018 FIX: Reject negative limit
    if (limit < 0) {
      throw new Error('limit must be a non-negative integer');
    }
    // BUG-019 FIX: Reject limit=0
    if (limit === 0) {
      throw new Error('limit must be a positive integer (>= 1)');
    }
  }

  if (offset !== undefined) {
    if (typeof offset !== 'number') {
      throw new Error('offset must be a number');
    }
    // BUG-018 FIX: Reject negative offset
    if (offset < 0) {
      throw new Error('offset must be a non-negative integer');
    }
  }
}

// BUG-022: Filter validation constants
const VALID_REQUIREMENT_CATEGORIES = ['functional', 'non-functional', 'technical', 'business'] as const;
const VALID_REQUIREMENT_STATUSES = ['draft', 'approved', 'implemented', 'deferred', 'rejected'] as const;

/**
 * Validates filter priority value.
 * BUG-022 FIX: Rejects invalid priority filter values.
 * @param priority - Priority filter value
 * @throws Error if priority is not in valid list
 */
export function validateFilterPriority(priority: unknown): void {
  if (priority === undefined) {
    return; // Optional filter
  }
  if (typeof priority !== 'string') {
    throw new Error('filters.priority must be a string');
  }
  if (!VALID_PRIORITIES.includes(priority as typeof VALID_PRIORITIES[number])) {
    throw new Error(
      `filters.priority must be one of: ${VALID_PRIORITIES.join(', ')} (got: '${priority}')`
    );
  }
}

/**
 * Validates filter category value.
 * BUG-022 FIX: Rejects invalid category filter values.
 * @param category - Category filter value
 * @throws Error if category is not in valid list
 */
export function validateFilterCategory(category: unknown): void {
  if (category === undefined) {
    return; // Optional filter
  }
  if (typeof category !== 'string') {
    throw new Error('filters.category must be a string');
  }
  if (!VALID_REQUIREMENT_CATEGORIES.includes(category as typeof VALID_REQUIREMENT_CATEGORIES[number])) {
    throw new Error(
      `filters.category must be one of: ${VALID_REQUIREMENT_CATEGORIES.join(', ')} (got: '${category}')`
    );
  }
}

/**
 * Validates filter status value.
 * BUG-022 FIX: Rejects invalid status filter values.
 * @param status - Status filter value
 * @throws Error if status is not in valid list
 */
export function validateFilterStatus(status: unknown): void {
  if (status === undefined) {
    return; // Optional filter
  }
  if (typeof status !== 'string') {
    throw new Error('filters.status must be a string');
  }
  if (!VALID_REQUIREMENT_STATUSES.includes(status as typeof VALID_REQUIREMENT_STATUSES[number])) {
    throw new Error(
      `filters.status must be one of: ${VALID_REQUIREMENT_STATUSES.join(', ')} (got: '${status}')`
    );
  }
}

// Export length constants for use in services
export { MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_RATIONALE_LENGTH };
