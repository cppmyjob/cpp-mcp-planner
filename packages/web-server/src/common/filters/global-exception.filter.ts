import {
  type ExceptionFilter,
  Catch,
  type ArgumentsHost,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { type Response } from 'express';
import {
  type RepositoryError,
  NotFoundError,
  ValidationError,
  ConflictError,
  LockError,
  isRepositoryError,
} from '@mcp-planner/core';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  timestamp: string;
  path: string;
}

/**
 * Global exception filter that maps domain errors to HTTP responses.
 *
 * Error mapping:
 * - NotFoundError -> 404 Not Found
 * - ValidationError -> 400 Bad Request
 * - ConflictError -> 409 Conflict
 * - LockError -> 423 Locked
 * - Other RepositoryError -> 500 Internal Server Error
 * - Unknown errors -> 500 Internal Server Error
 */
@Catch()
 
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();

    const { status, errorResponse } = this.buildErrorResponse(exception, request.url);

    this.logError(exception, status, request.url);

    response.status(status).json(errorResponse);
  }

  private buildErrorResponse(
    exception: unknown,
    path: string
  ): { status: number; errorResponse: ErrorResponse } {
    const timestamp = new Date().toISOString();

    // Handle NestJS HttpException (BadRequestException, NotFoundException, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const message = typeof response === 'string'
        ? response
        : (response as { message?: string | string[] }).message ?? exception.message;

      return {
        status,
        errorResponse: {
          success: false,
          error: {
            code: HttpStatus[status] ?? 'HTTP_ERROR',
            message: Array.isArray(message) ? message.join(', ') : message,
          },
          timestamp,
          path,
        },
      };
    }

    if (isRepositoryError(exception)) {
      const status = this.mapRepositoryErrorToStatus(exception);
      return {
        status,
        errorResponse: {
          success: false,
          error: {
            code: exception.code,
            message: exception.message,
            details: exception.details,
          },
          timestamp,
          path,
        },
      };
    }

    // Handle standard errors with message-based mapping
    // Note: Some Node.js errors (like SystemError) may not pass instanceof Error due to context issues
    const errorLike = exception as { message?: string; code?: string };
    if (exception instanceof Error || (errorLike.message !== undefined)) {
      const message = errorLike.message ?? String(exception);
      const status = this.mapErrorMessageToStatus(message);
      return {
        status,
        errorResponse: {
          success: false,
          error: {
            code: status === HttpStatus.NOT_FOUND ? 'NOT_FOUND' : 'INTERNAL_ERROR',
            message,
          },
          timestamp,
          path,
        },
      };
    }

    // Handle unknown errors
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorResponse: {
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: 'An unexpected error occurred',
        },
        timestamp,
        path,
      },
    };
  }

  private mapRepositoryErrorToStatus(error: RepositoryError): number {
    // HTTP 423 Locked - not in HttpStatus enum but valid HTTP status
    const HTTP_LOCKED = 423;

    if (error instanceof NotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (error instanceof ValidationError) {
      return HttpStatus.BAD_REQUEST;
    }
    if (error instanceof ConflictError) {
      return HttpStatus.CONFLICT;
    }
    if (error instanceof LockError) {
      return HTTP_LOCKED;
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  /**
   * Maps common error messages from domain services to HTTP status codes.
   * Used for errors that don't use the RepositoryError hierarchy.
   */
  private mapErrorMessageToStatus(message: string): HttpStatus {
    const lowerMessage = message.toLowerCase();

    // File system errors (ENOENT = file/directory not found)
    if (lowerMessage.includes('enoent') || lowerMessage.includes('no such file or directory')) {
      return HttpStatus.NOT_FOUND;
    }
    if (lowerMessage.includes('not found')) {
      return HttpStatus.NOT_FOUND;
    }
    if (
      lowerMessage.includes('validation') ||
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('cannot') ||
      lowerMessage.includes('requires') ||
      lowerMessage.includes('must be') ||
      lowerMessage.includes('non-empty') ||
      lowerMessage.includes('circular') ||
      lowerMessage.includes('self-referencing')
    ) {
      return HttpStatus.BAD_REQUEST;
    }
    if (lowerMessage.includes('already exists') || lowerMessage.includes('conflict')) {
      return HttpStatus.CONFLICT;
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private logError(exception: unknown, status: number, path: string): void {
    const errorMessage = exception instanceof Error ? exception.message : String(exception);
    const errorStack = exception instanceof Error ? exception.stack : undefined;

    // HTTP 500+ are server errors
    const SERVER_ERROR_THRESHOLD = 500;
    if (status >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(`[${String(status)}] ${path} - ${errorMessage}`, errorStack);
    } else {
      this.logger.warn(`[${String(status)}] ${path} - ${errorMessage}`);
    }
  }
}
