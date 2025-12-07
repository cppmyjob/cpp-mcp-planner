/**
 * Unit tests for bulk-operations utility
 * Sprint 9 BUGFIX: Atomic mode API contract validation
 */

import { bulkUpdateEntities, BulkUpdateConfig, BulkUpdateResult } from '../../../src/domain/utils/bulk-operations';

describe('bulkUpdateEntities utility', () => {
  describe('API contract validation', () => {
    it('RED (BUGFIX): should throw error when atomic=true but storage is undefined', async () => {
      /**
       * BUG: When atomic=true is requested but storage parameter is undefined,
       * the function silently falls through to non-atomic mode instead of throwing.
       * This violates the API contract - callers expect atomic behavior.
       *
       * Current code (bulk-operations.ts:67):
       *   if (atomic && storage) {  // <-- silently falls back when storage undefined
       *
       * Expected behavior: Throw error when atomic mode requested without storage
       */

      const mockUpdateFn = jest.fn().mockResolvedValue(undefined);

      // Attempt atomic mode without providing storage
      await expect(
        bulkUpdateEntities({
          entityType: 'requirements',
          entityIdField: 'requirementId',
          updateFn: mockUpdateFn,
          planId: 'test-plan',
          updates: [{ requirementId: 'req-1', updates: { title: 'Updated' } }],
          atomic: true,
          // storage: undefined - intentionally omitted!
        })
      ).rejects.toThrow(/storage.*required.*atomic/i);

      // The update function should NOT be called at all
      expect(mockUpdateFn).not.toHaveBeenCalled();
    });

    it('should work normally in non-atomic mode without storage', async () => {
      const mockUpdateFn = jest.fn().mockResolvedValue(undefined);

      const result = await bulkUpdateEntities({
        entityType: 'requirements',
        entityIdField: 'requirementId',
        updateFn: mockUpdateFn,
        planId: 'test-plan',
        updates: [
          { requirementId: 'req-1', updates: { title: 'Title 1' } },
          { requirementId: 'req-2', updates: { title: 'Title 2' } },
        ],
        atomic: false, // non-atomic mode
        // storage not needed for non-atomic
      });

      expect(result.updated).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockUpdateFn).toHaveBeenCalledTimes(2);
    });

    it('should work in atomic mode when storage is provided', async () => {
      const mockUpdateFn = jest.fn().mockResolvedValue(undefined);
      const mockStorage = {
        loadEntities: jest.fn().mockResolvedValue([
          { id: 'req-1', title: 'Original 1' },
          { id: 'req-2', title: 'Original 2' },
        ]),
        saveEntities: jest.fn().mockResolvedValue(undefined),
      };

      const result = await bulkUpdateEntities({
        entityType: 'requirements',
        entityIdField: 'requirementId',
        updateFn: mockUpdateFn,
        planId: 'test-plan',
        updates: [
          { requirementId: 'req-1', updates: { title: 'Updated 1' } },
          { requirementId: 'req-2', updates: { title: 'Updated 2' } },
        ],
        atomic: true,
        storage: mockStorage,
      });

      expect(result.updated).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockUpdateFn).toHaveBeenCalledTimes(2);
      expect(mockStorage.loadEntities).toHaveBeenCalled();
    });
  });
});
