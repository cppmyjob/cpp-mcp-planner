/**
 * Temp ID Resolver Utility
 *
 * Resolves temporary IDs ($0, $1, $2, ...) to real UUIDs
 * in batch operations.
 */

const TEMP_ID_REGEX = /^\$(\d+)$/;

/**
 * Check if a string is a valid temp ID format
 */
export function isTempId(value: string): boolean {
  return TEMP_ID_REGEX.test(value);
}

/**
 * Resolve a single temp ID to real ID
 * @param value - String that might be a temp ID
 * @param mapping - Mapping of temp IDs to real IDs
 * @returns Real ID if temp ID found in mapping, otherwise original value
 * @throws Error if temp ID not found in mapping
 */
export function resolveTempId(
  value: string,
  mapping: Record<string, string>
): string {
  if (!isTempId(value)) {
    // Not a temp ID - return as-is (could be a real UUID)
    return value;
  }

  // Validate format
  const match = value.match(TEMP_ID_REGEX);
  if (!match) {
    throw new Error(`Invalid temp ID format: ${value}`);
  }

  // Look up in mapping
  if (mapping[value]) {
    return mapping[value];
  }

  // Temp ID not found in mapping
  throw new Error(`Unresolved temp ID: ${value}`);
}

/**
 * Resolve temp IDs in specific fields of an object
 * @param obj - Object containing potentially resolvable fields
 * @param fieldMap - Map of field paths to resolve (e.g., { 'parentId': true, 'addressing': true })
 * @param mapping - Mapping of temp IDs to real IDs
 * @returns Object with temp IDs resolved in specified fields
 */
export function resolveFieldTempIds(
  obj: any,
  fieldMap: Record<string, boolean>,
  mapping: Record<string, string>
): any {
  if (!obj || typeof obj !== 'object' || Object.keys(fieldMap).length === 0) {
    return obj;
  }

  const resolved: any = Array.isArray(obj) ? [] : {};

  for (const [key, value] of Object.entries(obj)) {
    if (fieldMap[key]) {
      // This field should be resolved
      if (typeof value === 'string') {
        // Single ID field
        try {
          resolved[key] = resolveTempId(value, mapping);
        } catch {
          // If resolution fails, keep original (might be unresolved yet)
          resolved[key] = value;
        }
      } else if (Array.isArray(value)) {
        // Array of IDs (e.g., addressing, relatedRequirementIds)
        resolved[key] = value.map(item => {
          if (typeof item === 'string') {
            try {
              return resolveTempId(item, mapping);
            } catch {
              return item;
            }
          }
          return item;
        });
      } else {
        resolved[key] = value;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Check for nested paths (e.g., 'source.parentId')
      const nestedFieldMap: Record<string, boolean> = {};
      for (const fieldPath of Object.keys(fieldMap)) {
        if (fieldPath.startsWith(`${key}.`)) {
          const nestedKey = fieldPath.substring(key.length + 1);
          nestedFieldMap[nestedKey] = true;
        }
      }

      if (Object.keys(nestedFieldMap).length > 0) {
        resolved[key] = resolveFieldTempIds(value, nestedFieldMap, mapping);
      } else {
        resolved[key] = value;
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}
