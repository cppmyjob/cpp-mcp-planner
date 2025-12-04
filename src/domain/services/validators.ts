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

    if (typeof alt.option !== 'string' || !alt.option) {
      throw new Error(
        `Invalid alternativesConsidered at index ${i}: 'option' must be a non-empty string`
      );
    }

    if (typeof alt.reasoning !== 'string' || !alt.reasoning) {
      throw new Error(
        `Invalid alternativesConsidered at index ${i}: 'reasoning' must be a non-empty string`
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

    if (typeof tag.key !== 'string' || !tag.key) {
      throw new Error(
        `Invalid tag at index ${i}: 'key' must be a non-empty string`
      );
    }

    if (typeof tag.value !== 'string') {
      throw new Error(
        `Invalid tag at index ${i}: 'value' must be a string`
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

    if (typeof ex.language !== 'string' || !ex.language) {
      throw new Error(
        `Invalid codeExample at index ${i}: 'language' must be a non-empty string`
      );
    }

    if (typeof ex.code !== 'string') {
      throw new Error(
        `Invalid codeExample at index ${i}: 'code' must be a string`
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

export function validateFileTable(fileTable: unknown[]): void {
  if (!Array.isArray(fileTable)) {
    return;
  }

  for (let i = 0; i < fileTable.length; i++) {
    const entry = fileTable[i] as Record<string, unknown>;

    if (typeof entry.path !== 'string' || !entry.path) {
      throw new Error(
        `Invalid fileTable entry at index ${i}: 'path' must be a non-empty string`
      );
    }

    if (!VALID_FILE_ACTIONS.includes(entry.action as typeof VALID_FILE_ACTIONS[number])) {
      throw new Error(
        `Invalid fileTable entry at index ${i}: 'action' must be one of: ${VALID_FILE_ACTIONS.join(', ')}`
      );
    }
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
        `Invalid codeRef at index ${i}: must be a string`
      );
    }

    if (!ref) {
      throw new Error(
        `Invalid codeRef at index ${i}: cannot be empty`
      );
    }

    // Find the last colon - line number comes after it
    const lastColonIndex = ref.lastIndexOf(':');

    if (lastColonIndex === -1) {
      throw new Error(
        `Invalid codeRef at index ${i}: must be in format 'file_path:line_number' (e.g., 'src/file.ts:42')`
      );
    }

    const lineNumberStr = ref.slice(lastColonIndex + 1);
    const lineNumber = parseInt(lineNumberStr, 10);

    // Check if it's a positive integer
    if (!Number.isInteger(lineNumber) || lineNumber < 1 || lineNumberStr !== String(lineNumber)) {
      throw new Error(
        `Invalid codeRef at index ${i}: line number must be a positive integer (got '${lineNumberStr}')`
      );
    }
  }
}

export function validatePriority(priority: unknown): void {
  if (priority === undefined || priority === null) {
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
