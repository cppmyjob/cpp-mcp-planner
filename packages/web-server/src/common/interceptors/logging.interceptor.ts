import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  Logger,
} from '@nestjs/common';
import { type Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Logging interceptor that logs request details and response times.
 */
@Injectable()
 
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      ip: string;
    }>();
    const { method, url, ip } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<{ statusCode: number }>();
          const duration = Date.now() - startTime;
          this.logger.log(
            `${method} ${url} ${String(response.statusCode)} - ${String(duration)}ms - ${ip}`
          );
        },
        error: (error: unknown) => {
          const duration = Date.now() - startTime;
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.error(
            `${method} ${url} ERROR - ${String(duration)}ms - ${ip} - ${errorMessage}`
          );
        },
      })
    );
  }
}
