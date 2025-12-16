import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { map } from 'rxjs/operators';

interface ApiResponse<T> {
  success: boolean;
  data: T;
}

/**
 * HTTP interceptor that unwraps API responses from { success, data } format
 */
export const apiResponseInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    map(event => {
      if (event instanceof HttpResponse && event.body) {
        const body = event.body as ApiResponse<unknown>;
        // Unwrap { success, data } response format
        if (body && typeof body === 'object' && 'success' in body && 'data' in body) {
          return event.clone({ body: body.data });
        }
      }
      return event;
    })
  );
};
