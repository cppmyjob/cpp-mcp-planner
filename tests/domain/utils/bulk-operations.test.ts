/**
 * Unit tests for bulk-operations utility
 * Sprint 9 BUGFIX: Atomic mode API contract validation
 */

import { bulkUpdateEntities } from '../../../src/domain/utils/bulk-operations';

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

    it('RED (BUGFIX): atomic rollback should preserve all entity fields, not just ID', async () => {
      /**
       * CRITICAL BUG: BulkUpdateConfig.storage interface declares loadEntities returning
       * Array<{ id: string }> (line 14), which is too narrow. In atomic mode, the snapshot
       * created on line 75 will only contain `id` fields for each entity.
       *
       * When rollback occurs on line 99, saveEntities is called with this incomplete snapshot,
       * causing ALL entity fields except `id` to be permanently lost.
       *
       * Current type (bulk-operations.ts:14):
       *   loadEntities: (planId: string, entityType: string) => Promise<Array<{ id: string }>>;
       *
       * This is catastrophic - rollback should restore FULL entity state, not destroy data!
       *
       * Expected: loadEntities should return full entities (Array<any>) so snapshot preserves all fields
       */

      const fullEntities = [
        {
          id: 'req-1',
          type: 'requirement',
          title: 'Original Title 1',
          description: 'Original Description 1',
          priority: 'high',
          category: 'functional',
          status: 'active',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
          version: 1,
        },
        {
          id: 'req-2',
          type: 'requirement',
          title: 'Original Title 2',
          description: 'Original Description 2',
          priority: 'medium',
          category: 'technical',
          status: 'active',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
          version: 1,
        },
      ];

      const mockStorage = {
        loadEntities: jest.fn().mockResolvedValue(fullEntities),
        saveEntities: jest.fn().mockResolvedValue(undefined),
      };

      // First update succeeds, second fails
      const mockUpdateFn = jest
        .fn()
        .mockResolvedValueOnce(undefined) // req-1 succeeds
        .mockRejectedValueOnce(new Error('Validation failed')); // req-2 fails

      // Attempt atomic bulk update that will fail and rollback
      await expect(
        bulkUpdateEntities({
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
        })
      ).rejects.toThrow(/atomic bulk update failed/i);

      // Verify rollback was called
      expect(mockStorage.saveEntities).toHaveBeenCalledTimes(1);

      // CRITICAL CHECK: Verify rollback snapshot contains ALL fields, not just { id }
      const rollbackSnapshot = mockStorage.saveEntities.mock.calls[0][2];
      expect(rollbackSnapshot).toHaveLength(2);

      // Check first entity has ALL original fields preserved
      expect(rollbackSnapshot[0]).toEqual(fullEntities[0]);
      expect(rollbackSnapshot[0].title).toBe('Original Title 1');
      expect(rollbackSnapshot[0].description).toBe('Original Description 1');
      expect(rollbackSnapshot[0].priority).toBe('high');
      expect(rollbackSnapshot[0].category).toBe('functional');

      // Check second entity has ALL original fields preserved
      expect(rollbackSnapshot[1]).toEqual(fullEntities[1]);
      expect(rollbackSnapshot[1].title).toBe('Original Title 2');
      expect(rollbackSnapshot[1].description).toBe('Original Description 2');
      expect(rollbackSnapshot[1].priority).toBe('medium');
      expect(rollbackSnapshot[1].category).toBe('technical');
    });

    it('RED (BUGFIX): should capture both original error and rollback failure', async () => {
      /**
       * BUG: In atomic mode, if an update fails and then the rollback saveEntities also throws,
       * the original update error is lost. The caller only sees the rollback error, making it
       * impossible to diagnose why the update actually failed.
       *
       * Current code (bulk-operations.ts:99-102):
       *   } catch (error: any) {
       *     await storage.saveEntities(planId, entityType, snapshot);  // <-- if this throws
       *     throw new Error(`Atomic bulk update failed: ${error.message}...`); // original error is lost!
       *   }
       *
       * If saveEntities throws during rollback, the original error is masked.
       *
       * Expected: Error handling should capture BOTH the original error and any rollback failure
       * to provide complete diagnostic information.
       */

      const mockStorage = {
        loadEntities: jest.fn().mockResolvedValue([
          { id: 'req-1', title: 'Original 1' },
          { id: 'req-2', title: 'Original 2' },
        ]),
        // Rollback will also fail!
        saveEntities: jest.fn().mockRejectedValue(new Error('Rollback failed: disk full')),
      };

      const mockUpdateFn = jest
        .fn()
        .mockResolvedValueOnce(undefined) // req-1 succeeds
        .mockRejectedValueOnce(new Error('Validation error: invalid title format')); // req-2 fails

      // Attempt atomic bulk update where both update AND rollback fail
      // The thrown error should contain information about BOTH failures:
      // 1. The original validation error
      // 2. The rollback failure
      try {
        await bulkUpdateEntities({
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
        throw new Error('Expected bulkUpdateEntities to throw');
      } catch (error: any) {
        // Skip if it's our own assertion error
        if (error.message === 'Expected bulkUpdateEntities to throw') {
          throw error;
        }
        // CRITICAL: Error message should mention BOTH the original error and rollback failure
        expect(error.message).toMatch(/validation error.*invalid title format/i);
        expect(error.message).toMatch(/rollback.*failed.*disk full/i);
      }
    });
  });
});
