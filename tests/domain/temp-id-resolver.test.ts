import { describe, it, expect } from '@jest/globals';
import {
  isTempId,
  resolveTempId,
  resolveFieldTempIds,
} from '@mcp-planner/core';

describe('TempIdResolver', () => {
  describe('isTempId', () => {
    it('Test 18: should return true for valid temp ID format', () => {
      expect(isTempId('$0')).toBe(true);
      expect(isTempId('$1')).toBe(true);
      expect(isTempId('$999')).toBe(true);
    });

    it('Test 19: should return false for real UUID', () => {
      expect(isTempId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
    });

    it('Test 20: should return false for invalid formats', () => {
      expect(isTempId('')).toBe(false);
      expect(isTempId('$')).toBe(false);
      expect(isTempId('$-1')).toBe(false);
      expect(isTempId('$abc')).toBe(false);
      expect(isTempId('0')).toBe(false);
      expect(isTempId('temp-id')).toBe(false);
    });
  });

  describe('resolveTempId', () => {
    const mapping = {
      '$0': '550e8400-e29b-41d4-a716-446655440000',
      '$1': '660e8400-e29b-41d4-a716-446655440001',
    };

    it('Test 21: should resolve temp ID to real UUID', () => {
      expect(resolveTempId('$0', mapping)).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(resolveTempId('$1', mapping)).toBe('660e8400-e29b-41d4-a716-446655440001');
    });

    it('Test 22: should return real UUID unchanged', () => {
      const realUuid = '770e8400-e29b-41d4-a716-446655440002';
      expect(resolveTempId(realUuid, mapping)).toBe(realUuid);
    });

    it('Test 23: should throw error for unresolved temp ID', () => {
      expect(() => resolveTempId('$99', mapping)).toThrow('Unresolved temp ID: $99');
    });

    it('Test 24: should return invalid temp ID format unchanged', () => {
      // Invalid formats are not recognized as temp IDs, so returned as-is
      expect(resolveTempId('$-1', mapping)).toBe('$-1');
      expect(resolveTempId('$abc', mapping)).toBe('$abc');
      expect(resolveTempId('$', mapping)).toBe('$');
    });
  });

  describe('resolveFieldTempIds', () => {
    const mapping = {
      '$0': '550e8400-e29b-41d4-a716-446655440000',
      '$1': '660e8400-e29b-41d4-a716-446655440001',
      '$2': '770e8400-e29b-41d4-a716-446655440002',
    };

    it('Test 25: should resolve temp IDs only in specified fields', () => {
      const obj = {
        parentId: '$0',
        title: 'Task with $0 in title',
        description: 'This references $1',
      };

      const result = resolveFieldTempIds(obj, { parentId: true }, mapping) as Record<string, unknown>;

      expect(result.parentId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.title).toBe('Task with $0 in title'); // Not resolved
      expect(result.description).toBe('This references $1'); // Not resolved
    });

    it('Test 26: should resolve temp IDs in array fields', () => {
      const obj = {
        addressing: ['$0', '$1'],
        relatedRequirementIds: ['$2'],
        title: 'Solution',
      };

      const result = resolveFieldTempIds(
        obj,
        { addressing: true, relatedRequirementIds: true },
        mapping
      ) as Record<string, unknown>;

      expect(result.addressing).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '660e8400-e29b-41d4-a716-446655440001',
      ]);
      expect(result.relatedRequirementIds).toEqual(['770e8400-e29b-41d4-a716-446655440002']);
    });

    it('Test 27: should handle null and undefined gracefully', () => {
      expect(resolveFieldTempIds(null, { parentId: true }, mapping)).toBeNull();
      expect(resolveFieldTempIds(undefined, { parentId: true }, mapping)).toBeUndefined();

      const objWithNull = {
        parentId: null,
        addressing: undefined,
      };

      const result = resolveFieldTempIds(
        objWithNull,
        { parentId: true, addressing: true },
        mapping
      ) as Record<string, unknown>;

      expect(result.parentId).toBeNull();
      expect(result.addressing).toBeUndefined();
    });

    it('Test 28: should return unchanged object with empty fieldMap', () => {
      const obj = {
        parentId: '$0',
        title: 'Task',
      };

      const result = resolveFieldTempIds(obj, {}, mapping) as Record<string, unknown>;

      expect(result.parentId).toBe('$0'); // Not resolved
      expect(result.title).toBe('Task');
    });

    it('Test 29: should resolve nested field paths', () => {
      const obj = {
        source: {
          type: 'user-request',
          parentId: '$0',
          context: 'Reference to $1',
        },
        title: 'Requirement',
      };

      const result = resolveFieldTempIds(obj, { 'source.parentId': true }, mapping) as Record<string, unknown>;

      expect((result.source as Record<string, unknown>).parentId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect((result.source as Record<string, unknown>).context).toBe('Reference to $1'); // Not resolved
      expect((result.source as Record<string, unknown>).type).toBe('user-request');
    });

    it('Test 30: should handle unresolved temp IDs gracefully', () => {
      const obj = {
        parentId: '$99', // Not in mapping
        title: 'Task',
      };

      // Should not throw, just keep the unresolved ID
      const result = resolveFieldTempIds(obj, { parentId: true }, mapping) as Record<string, unknown>;
      expect(result.parentId).toBe('$99');
    });

    it('Test 31: should handle mixed real UUIDs and temp IDs in arrays', () => {
      const obj = {
        addressing: ['$0', '990e8400-e29b-41d4-a716-446655440099', '$1'],
      };

      const result = resolveFieldTempIds(obj, { addressing: true }, mapping) as Record<string, unknown>;

      expect(result.addressing).toEqual([
        '550e8400-e29b-41d4-a716-446655440000',
        '990e8400-e29b-41d4-a716-446655440099', // Real UUID unchanged
        '660e8400-e29b-41d4-a716-446655440001',
      ]);
    });
  });
});
