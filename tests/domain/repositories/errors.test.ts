import { describe, it, expect } from '@jest/globals';
import {
  RepositoryError,
  NotFoundError,
  ValidationError,
  ConflictError,
  TransactionError,
  LockError,
  StorageError,
  QueryError,
  IndexError,
  BulkOperationError,
  MigrationError,
  isRepositoryError,
  isErrorType,
  extractErrorInfo,
} from '../../../src/domain/repositories/errors.js';

describe('Repository Error System', () => {
  describe('RepositoryError', () => {
    it('should create base repository error', () => {
      const error = new RepositoryError('Test error', 'TEST_CODE', { foo: 'bar' });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RepositoryError);
      expect(error.name).toBe('RepositoryError');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.details).toEqual({ foo: 'bar' });
    });

    it('should serialize to JSON', () => {
      const error = new RepositoryError('Test error', 'TEST_CODE', { foo: 'bar' });
      const json = error.toJSON();

      expect(json.name).toBe('RepositoryError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_CODE');
      expect(json.details).toEqual({ foo: 'bar' });
      expect(json.stack).toBeDefined();
    });

    it('should work without details', () => {
      const error = new RepositoryError('Test error', 'TEST_CODE');

      expect(error.details).toBeUndefined();
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with entity info', () => {
      const error = new NotFoundError('Requirement', 'req-123');

      expect(error).toBeInstanceOf(NotFoundError);
      expect(error).toBeInstanceOf(RepositoryError);
      expect(error.name).toBe('NotFoundError');
      expect(error.message).toBe("Requirement with ID 'req-123' not found");
      expect(error.code).toBe('NOT_FOUND');
      expect(error.details).toEqual({
        entityType: 'Requirement',
        entityId: 'req-123',
      });
    });

    it('should include additional details', () => {
      const error = new NotFoundError('Phase', 'phase-456', { planId: 'plan-1' });

      expect(error.details).toEqual({
        entityType: 'Phase',
        entityId: 'phase-456',
        planId: 'plan-1',
      });
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with error list', () => {
      const errors = [
        { field: 'title', message: 'Title is required' },
        { field: 'priority', message: 'Invalid priority value', value: 'invalid' },
      ];
      const error = new ValidationError('Validation failed', errors);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Validation failed');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual(errors);
    });

    it('should include additional details', () => {
      const errors = [{ field: 'status', message: 'Invalid status' }];
      const error = new ValidationError('Validation failed', errors, { entityType: 'Solution' });

      expect(error.details).toMatchObject({
        errors,
        entityType: 'Solution',
      });
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error with conflict type', () => {
      const error = new ConflictError('Entity already exists', 'duplicate');

      expect(error).toBeInstanceOf(ConflictError);
      expect(error.name).toBe('ConflictError');
      expect(error.message).toBe('Entity already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.conflictType).toBe('duplicate');
    });

    it('should support all conflict types', () => {
      const types: ('duplicate' | 'version' | 'constraint' | 'state')[] =
        ['duplicate', 'version', 'constraint', 'state'];

      types.forEach(type => {
        const error = new ConflictError(`Conflict: ${type}`, type);
        expect(error.conflictType).toBe(type);
      });
    });

    it('should include version info for version conflicts', () => {
      const error = new ConflictError(
        'Version mismatch',
        'version',
        { expected: 1, actual: 2 }
      );

      expect(error.details).toMatchObject({
        conflictType: 'version',
        expected: 1,
        actual: 2,
      });
    });
  });

  describe('TransactionError', () => {
    it('should create transaction error with operation', () => {
      const error = new TransactionError('Failed to commit', 'commit');

      expect(error).toBeInstanceOf(TransactionError);
      expect(error.name).toBe('TransactionError');
      expect(error.code).toBe('TRANSACTION_ERROR');
      expect(error.operation).toBe('commit');
    });

    it('should support all operation types', () => {
      const operations: ('begin' | 'commit' | 'rollback')[] =
        ['begin', 'commit', 'rollback'];

      operations.forEach(op => {
        const error = new TransactionError(`Failed to ${op}`, op);
        expect(error.operation).toBe(op);
      });
    });
  });

  describe('LockError', () => {
    it('should create lock error with lock type', () => {
      const error = new LockError('Failed to acquire lock', 'acquire');

      expect(error).toBeInstanceOf(LockError);
      expect(error.name).toBe('LockError');
      expect(error.code).toBe('LOCK_ERROR');
      expect(error.lockType).toBe('acquire');
    });

    it('should support all lock types', () => {
      const types: ('acquire' | 'release' | 'timeout' | 'deadlock')[] =
        ['acquire', 'release', 'timeout', 'deadlock'];

      types.forEach(type => {
        const error = new LockError(`Lock ${type} error`, type);
        expect(error.lockType).toBe(type);
      });
    });

    it('should include timeout info for timeout errors', () => {
      const error = new LockError('Lock timeout', 'timeout', {
        timeout: 5000,
        entityId: 'entity-1',
      });

      expect(error.details).toMatchObject({
        lockType: 'timeout',
        timeout: 5000,
        entityId: 'entity-1',
      });
    });
  });

  describe('StorageError', () => {
    it('should create storage error with storage type', () => {
      const error = new StorageError('File system error', 'file');

      expect(error).toBeInstanceOf(StorageError);
      expect(error.name).toBe('StorageError');
      expect(error.code).toBe('STORAGE_ERROR');
      expect(error.storageType).toBe('file');
    });

    it('should include cause error', () => {
      const cause = new Error('ENOENT: file not found');
      const error = new StorageError('Storage failed', 'sqlite', cause);

      expect(error.cause).toBe(cause);
      expect(error.details).toMatchObject({
        storageType: 'sqlite',
        cause: 'ENOENT: file not found',
      });
    });
  });

  describe('QueryError', () => {
    it('should create query error with query type', () => {
      const error = new QueryError('Invalid filter', 'filter');

      expect(error).toBeInstanceOf(QueryError);
      expect(error.name).toBe('QueryError');
      expect(error.code).toBe('QUERY_ERROR');
      expect(error.queryType).toBe('filter');
    });

    it('should support all query types', () => {
      const types: ('filter' | 'sort' | 'pagination' | 'syntax')[] =
        ['filter', 'sort', 'pagination', 'syntax'];

      types.forEach(type => {
        const error = new QueryError(`Query ${type} error`, type);
        expect(error.queryType).toBe(type);
      });
    });
  });

  describe('IndexError', () => {
    it('should create index error with operation', () => {
      const error = new IndexError('Index creation failed', 'create');

      expect(error).toBeInstanceOf(IndexError);
      expect(error.name).toBe('IndexError');
      expect(error.code).toBe('INDEX_ERROR');
      expect(error.operation).toBe('create');
    });

    it('should support all operation types', () => {
      const operations: ('create' | 'update' | 'delete' | 'rebuild')[] =
        ['create', 'update', 'delete', 'rebuild'];

      operations.forEach(op => {
        const error = new IndexError(`Index ${op} failed`, op);
        expect(error.operation).toBe(op);
      });
    });
  });

  describe('BulkOperationError', () => {
    it('should create bulk operation error with statistics', () => {
      const failures = [
        { index: 0, error: new Error('Failed'), operation: 'create' as const },
        { index: 2, error: new Error('Failed'), operation: 'update' as const },
      ];
      const error = new BulkOperationError('Bulk operation failed', 3, 2, failures);

      expect(error).toBeInstanceOf(BulkOperationError);
      expect(error.name).toBe('BulkOperationError');
      expect(error.code).toBe('BULK_OPERATION_ERROR');
      expect(error.successCount).toBe(3);
      expect(error.failureCount).toBe(2);
      expect(error.failures).toEqual(failures);
    });

    it('should include entity IDs in failures', () => {
      const failures = [
        { entityId: 'entity-1', index: 0, error: new Error('Failed'), operation: 'delete' as const },
      ];
      const error = new BulkOperationError('Delete failed', 0, 1, failures);

      expect(error.failures[0].entityId).toBe('entity-1');
    });
  });

  describe('MigrationError', () => {
    it('should create migration error with version and direction', () => {
      const error = new MigrationError('Migration failed', '2.0.0', 'up');

      expect(error).toBeInstanceOf(MigrationError);
      expect(error.name).toBe('MigrationError');
      expect(error.code).toBe('MIGRATION_ERROR');
      expect(error.migrationVersion).toBe('2.0.0');
      expect(error.direction).toBe('up');
    });

    it('should support both directions', () => {
      const upError = new MigrationError('Migration up failed', '2.0.0', 'up');
      const downError = new MigrationError('Migration down failed', '1.0.0', 'down');

      expect(upError.direction).toBe('up');
      expect(downError.direction).toBe('down');
    });
  });

  describe('isRepositoryError', () => {
    it('should return true for repository errors', () => {
      expect(isRepositoryError(new RepositoryError('test', 'TEST'))).toBe(true);
      expect(isRepositoryError(new NotFoundError('Entity', 'id'))).toBe(true);
      expect(isRepositoryError(new ValidationError('test', []))).toBe(true);
    });

    it('should return false for non-repository errors', () => {
      expect(isRepositoryError(new Error('test'))).toBe(false);
      expect(isRepositoryError('not an error')).toBe(false);
      expect(isRepositoryError(null)).toBe(false);
      expect(isRepositoryError(undefined)).toBe(false);
    });
  });

  describe('isErrorType', () => {
    it('should correctly identify specific error types', () => {
      const notFoundError = new NotFoundError('Entity', 'id');
      const validationError = new ValidationError('test', []);

      expect(isErrorType(notFoundError, NotFoundError)).toBe(true);
      expect(isErrorType(notFoundError, ValidationError)).toBe(false);
      expect(isErrorType(validationError, ValidationError)).toBe(true);
      expect(isErrorType(validationError, NotFoundError)).toBe(false);
    });

    it('should return false for non-errors', () => {
      expect(isErrorType('not an error', NotFoundError)).toBe(false);
      expect(isErrorType(null, ValidationError)).toBe(false);
    });
  });

  describe('extractErrorInfo', () => {
    it('should extract info from repository errors', () => {
      const error = new NotFoundError('Entity', 'id-123');
      const info = extractErrorInfo(error);

      expect(info.name).toBe('NotFoundError');
      expect(info.message).toContain('id-123');
      expect(info.code).toBe('NOT_FOUND');
      expect(info.details).toBeDefined();
      expect(info.stack).toBeDefined();
    });

    it('should extract info from regular errors', () => {
      const error = new Error('Regular error');
      const info = extractErrorInfo(error);

      expect(info.name).toBe('Error');
      expect(info.message).toBe('Regular error');
      expect(info.code).toBeUndefined();
      expect(info.stack).toBeDefined();
    });

    it('should handle non-error values', () => {
      const info1 = extractErrorInfo('string error');
      expect(info1.name).toBe('UnknownError');
      expect(info1.message).toBe('string error');

      const info2 = extractErrorInfo(null);
      expect(info2.name).toBe('UnknownError');
      expect(info2.message).toBe('null');

      const info3 = extractErrorInfo({ custom: 'object' });
      expect(info3.name).toBe('UnknownError');
      expect(info3.message).toBe('[object Object]');
    });
  });
});
