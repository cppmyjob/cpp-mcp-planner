import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { ProjectStateService } from '../services';

/**
 * GREEN: Phase 4.14 - Route guard that requires an active project.
 * Redirects to root if no project is selected.
 *
 * Usage in routes:
 * {
 *   path: 'some-route',
 *   component: SomeComponent,
 *   canActivate: [projectRequiredGuard]
 * }
 */
export const projectRequiredGuard: CanActivateFn = () => {
  const projectState = inject(ProjectStateService);
  const router = inject(Router);

  const hasProject = projectState.hasActiveProject();

  if (!hasProject) {
    // Redirect to root if no project is selected
    router.navigate(['/']);
    return false;
  }

  return true;
};
