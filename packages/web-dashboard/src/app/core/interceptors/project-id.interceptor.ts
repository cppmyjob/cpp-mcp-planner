import { inject } from '@angular/core';
import { type HttpInterceptorFn } from '@angular/common/http';
import { ProjectStateService } from '../services';

/**
 * GREEN: Phase 4.3 - HTTP interceptor that adds X-Project-Id header to all requests.
 * Uses activeProjectId from ProjectStateService.
 * If no project is active (null), the header is not added.
 */
export const projectIdInterceptor: HttpInterceptorFn = (req, next) => {
  const projectState = inject(ProjectStateService);
  const projectId = projectState.activeProjectId();

  // Only add header if projectId is not null
  if (projectId !== null) {
    const cloned = req.clone({
      setHeaders: {
        'X-Project-Id': projectId
      }
    });
    return next(cloned);
  }

  return next(req);
};
