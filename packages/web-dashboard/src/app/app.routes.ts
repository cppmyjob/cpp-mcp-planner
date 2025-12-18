import { type Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard').then(m => m.DashboardComponent),
    title: 'Dashboard - MCP Planner'
  },
  {
    path: 'requirements',
    loadComponent: () => import('./features/requirements/requirements').then(m => m.RequirementsComponent),
    title: 'Requirements - MCP Planner'
  },
  {
    path: 'solutions',
    loadComponent: () => import('./features/solutions/solutions').then(m => m.SolutionsComponent),
    title: 'Solutions - MCP Planner'
  },
  {
    path: 'decisions',
    loadComponent: () => import('./features/decisions/decisions').then(m => m.DecisionsComponent),
    title: 'Decisions - MCP Planner'
  },
  {
    path: 'phases',
    loadComponent: () => import('./features/phases/phases').then(m => m.PhasesComponent),
    title: 'Phases - MCP Planner'
  },
  {
    path: 'artifacts',
    loadComponent: () => import('./features/artifacts/artifacts').then(m => m.ArtifactsComponent),
    title: 'Artifacts - MCP Planner'
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
