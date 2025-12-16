import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiService } from './api.service';
import type {
  PlanManifest,
  CreatePlanDto,
  UpdatePlanDto,
  ListPlansParams,
  PlanSummary
} from '../models';

interface PlansListResponse {
  plans: PlanManifest[];
  total: number;
  hasMore: boolean;
}

interface ActivePlanResponse {
  activePlan: PlanManifest | null;
}

/**
 * Service for Plan API operations
 */
@Injectable({
  providedIn: 'root'
})
export class PlanService {
  private readonly api = inject(ApiService);

  /**
   * List all plans with optional filters
   */
  public list(params?: ListPlansParams): Observable<PlanManifest[]> {
    return this.api.get<PlansListResponse>('/plans', params as Record<string, unknown>).pipe(
      map(response => response.plans)
    );
  }

  /**
   * Get single plan by ID
   */
  public get(planId: string): Observable<PlanManifest> {
    return this.api.get<PlanManifest>(`/plans/${planId}`);
  }

  /**
   * Create new plan
   */
  public create(dto: CreatePlanDto): Observable<PlanManifest> {
    return this.api.post<PlanManifest>('/plans', dto);
  }

  /**
   * Update existing plan
   */
  public update(planId: string, dto: UpdatePlanDto): Observable<PlanManifest> {
    return this.api.patch<PlanManifest>(`/plans/${planId}`, dto);
  }

  /**
   * Delete plan
   */
  public delete(planId: string): Observable<void> {
    return this.api.delete<void>(`/plans/${planId}`);
  }

  /**
   * Get plan summary with statistics
   */
  public getSummary(planId: string): Observable<PlanSummary> {
    return this.api.get<PlanSummary>(`/plans/${planId}/summary`);
  }

  /**
   * Activate plan for workspace
   */
  public activate(planId: string, workspacePath: string): Observable<void> {
    return this.api.post<void>(`/plans/${planId}/activate`, { workspacePath });
  }

  /**
   * Get active plan for workspace
   */
  public getActive(workspacePath: string): Observable<PlanManifest | null> {
    return this.api.get<ActivePlanResponse>('/plans/active', { workspacePath }).pipe(
      map(response => response.activePlan)
    );
  }

  /**
   * Archive plan
   */
  public archive(planId: string, reason?: string): Observable<void> {
    return this.api.post<void>(`/plans/${planId}/archive`, { reason });
  }
}
