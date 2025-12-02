/**
 * Common validation functions for entity fields
 */

const VALID_EFFORT_UNITS = ['hours', 'days', 'weeks', 'story-points'] as const;
const VALID_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const;

export function validateEffortEstimate(effort: unknown, fieldName = 'effortEstimate'): void {
  if (effort === undefined || effort === null) {
    return; // Optional field
  }

  const e = effort as Record<string, unknown>;

  // Check for invalid legacy format { hours: X, complexity: Y }
  if ('hours' in e || 'complexity' in e) {
    throw new Error(
      `Invalid ${fieldName} format: found legacy { hours, complexity } format. ` +
      `Expected { value: number, unit: 'hours'|'days'|'weeks'|'story-points', confidence: 'low'|'medium'|'high' }`
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
