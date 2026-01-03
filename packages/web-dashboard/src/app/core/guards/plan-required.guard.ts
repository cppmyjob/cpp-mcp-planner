import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { PlanStateService } from '../services';

/**
 * GREEN: Phase 4.15 - Route guard that requires an active plan.
 * Redirects to root if no plan is selected.
 *
 * Usage in routes:
 * {
 *   path: 'some-route',
 *   component: SomeComponent,
 *   canActivate: [planRequiredGuard]
 * }
 *
 * Note: This guard only checks for an active plan.
 * If a route requires both project and plan, use both guards:
 * canActivate: [projectRequiredGuard, planRequiredGuard]
 */
export const planRequiredGuard: CanActivateFn = () => {
  const planState = inject(PlanStateService);
  const router = inject(Router);

  const hasPlan = planState.hasActivePlan();

  if (!hasPlan) {
    // Redirect to root if no plan is selected
    router.navigate(['/']);
    return false;
  }

  return true;
};
