/**
 * Repository Error System
 *
 * Provides a comprehensive error hierarchy for repository operations.
 * All repository errors extend RepositoryError base class.
 */

/**
 * Base error class for all repository operations
 */
export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RepositoryError';
    Object.setPrototypeOf(this, RepositoryError.prototype);
  }

  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Entity not found error
 * Thrown when attempting to access a non-existent entity
 */
export class NotFoundError extends RepositoryError {
  constructor(
    entityType: string,
    entityId: string,
    details?: Record<string, unknown>
  ) {
    super(
      `${entityType} with ID '${entityId}' not found`,
      'NOT_FOUND',
      { entityType, entityId, ...details }
    );
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Validation error
 * Thrown when entity data fails validation
 */
export class ValidationError extends RepositoryError {
  constructor(
    message: string,
    public readonly errors: ValidationErrorDetail[] = [],
    details?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', { errors, ...details });
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Conflict error
 * Thrown when operation conflicts with existing data
 */
export class ConflictError extends RepositoryError {
  constructor(
    message: string,
    public readonly conflictType: 'duplicate' | 'version' | 'constraint' | 'state',
    details?: Record<string, unknown>
  ) {
    super(message, 'CONFLICT', { conflictType, ...details });
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

/**
 * Transaction error
 * Thrown when transaction operation fails
 */
export class TransactionError extends RepositoryError {
  constructor(
    message: string,
    public readonly operation: 'begin' | 'commit' | 'rollback',
    details?: Record<string, unknown>
  ) {
    super(message, 'TRANSACTION_ERROR', { operation, ...details });
    this.name = 'TransactionError';
    Object.setPrototypeOf(this, TransactionError.prototype);
  }
}

/**
 * Lock error
 * Thrown when lock operation fails
 */
export class LockError extends RepositoryError {
  constructor(
    message: string,
    public readonly lockType: 'acquire' | 'release' | 'timeout' | 'deadlock',
    details?: Record<string, unknown>
  ) {
    super(message, 'LOCK_ERROR', { lockType, ...details });
    this.name = 'LockError';
    Object.setPrototypeOf(this, LockError.prototype);
  }
}

/**
 * Storage error
 * Thrown when underlying storage system fails
 */
export class StorageError extends RepositoryError {
  constructor(
    message: string,
    public readonly storageType: string,
    public readonly cause?: Error,
    details?: Record<string, unknown>
  ) {
    super(message, 'STORAGE_ERROR', { storageType, cause: cause?.message, ...details });
    this.name = 'StorageError';
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/**
 * Query error
 * Thrown when query operation fails
 */
export class QueryError extends RepositoryError {
  constructor(
    message: string,
    public readonly queryType: 'filter' | 'sort' | 'pagination' | 'syntax',
    details?: Record<string, unknown>
  ) {
    super(message, 'QUERY_ERROR', { queryType, ...details });
    this.name = 'QueryError';
    Object.setPrototypeOf(this, QueryError.prototype);
  }
}

/**
 * Index error
 * Thrown when index operation fails
 */
export class IndexError extends RepositoryError {
  constructor(
    message: string,
    public readonly operation: 'create' | 'update' | 'delete' | 'rebuild',
    details?: Record<string, unknown>
  ) {
    super(message, 'INDEX_ERROR', { operation, ...details });
    this.name = 'IndexError';
    Object.setPrototypeOf(this, IndexError.prototype);
  }
}

/**
 * Bulk operation error
 * Thrown when bulk operation fails partially or completely
 */
export class BulkOperationError extends RepositoryError {
  constructor(
    message: string,
    public readonly successCount: number,
    public readonly failureCount: number,
    public readonly failures: BulkOperationFailure[],
    details?: Record<string, unknown>
  ) {
    super(message, 'BULK_OPERATION_ERROR', {
      successCount,
      failureCount,
      failures,
      ...details,
    });
    this.name = 'BulkOperationError';
    Object.setPrototypeOf(this, BulkOperationError.prototype);
  }
}

export interface BulkOperationFailure {
  entityId?: string;
  index: number;
  error: Error;
  operation: 'create' | 'update' | 'delete';
}

/**
 * Migration error
 * Thrown when data migration fails
 */
export class MigrationError extends RepositoryError {
  constructor(
    message: string,
    public readonly migrationVersion: string,
    public readonly direction: 'up' | 'down',
    details?: Record<string, unknown>
  ) {
    super(message, 'MIGRATION_ERROR', { migrationVersion, direction, ...details });
    this.name = 'MigrationError';
    Object.setPrototypeOf(this, MigrationError.prototype);
  }
}

/**
 * Type guard to check if error is a RepositoryError
 */
export function isRepositoryError(error: unknown): error is RepositoryError {
  return error instanceof RepositoryError;
}

/**
 * Type guard to check if error is a specific repository error type
 */
export function isErrorType<T extends RepositoryError>(
  error: unknown,
  errorConstructor: new (...args: never[]) => T
): error is T {
  return error instanceof errorConstructor;
}

/**
 * Extract error information for logging
 */
export function extractErrorInfo(error: unknown): {
  name: string;
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  stack?: string;
} {
  if (isRepositoryError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      details: error.details,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: 'UnknownError',
    message: String(error),
  };
}
