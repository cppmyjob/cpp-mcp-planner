import { type Routes } from '@angular/router';
import { projectRequiredGuard, planRequiredGuard } from './core';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent),
    title: 'Dashboard - MCP Planner',
    canActivate: [projectRequiredGuard, planRequiredGuard] // GREEN: Phase 4.16
  },
  {
    path: 'requirements',
    loadComponent: () => import('./features/requirements/requirements').then(m => m.RequirementsComponent),
    title: 'Requirements - MCP Planner',
    canActivate: [projectRequiredGuard, planRequiredGuard] // GREEN: Phase 4.16
  },
  {
    path: 'solutions',
    loadComponent: () => import('./features/solutions/solutions').then(m => m.SolutionsComponent),
    title: 'Solutions - MCP Planner',
    canActivate: [projectRequiredGuard, planRequiredGuard] // GREEN: Phase 4.16
  },
  {
    path: 'decisions',
    loadComponent: () => import('./features/decisions/decisions').then(m => m.DecisionsComponent),
    title: 'Decisions - MCP Planner',
    canActivate: [projectRequiredGuard, planRequiredGuard] // GREEN: Phase 4.16
  },
  {
    path: 'phases',
    loadComponent: () => import('./features/phases/phases').then(m => m.PhasesComponent),
    title: 'Phases - MCP Planner',
    canActivate: [projectRequiredGuard, planRequiredGuard] // GREEN: Phase 4.16
  },
  {
    path: 'artifacts',
    loadComponent: () => import('./features/artifacts/artifacts').then(m => m.ArtifactsComponent),
    title: 'Artifacts - MCP Planner',
    canActivate: [projectRequiredGuard, planRequiredGuard] // GREEN: Phase 4.16
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
