import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

/**
 * Transform interceptor that wraps all successful responses
 * in a unified format: { success: true, data: ... }
 */
@Injectable()
 
export class TransformInterceptor<T> implements NestInterceptor<T, SuccessResponse<T>> {
  public intercept(
    _context: ExecutionContext,
    next: CallHandler<T>
  ): Observable<SuccessResponse<T>> {
    return next.handle().pipe<SuccessResponse<T>>(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
      map((data: T): SuccessResponse<T> => ({
        success: true as const,
        data,
      }))
    );
  }
}
