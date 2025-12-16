import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';

import { ApiService } from './api.service';
import type {
  Solution,
  CreateSolutionDto,
  UpdateSolutionDto,
  ListSolutionsParams,
  SelectSolutionDto,
  SolutionComparison,
  VersionHistory
} from '../models';

/**
 * Service for Solution API operations
 */
@Injectable({
  providedIn: 'root'
})
export class SolutionService {
  private readonly api = inject(ApiService);

  /**
   * List solutions for plan
   */
  public list(planId: string, params?: ListSolutionsParams): Observable<Solution[]> {
    return this.api.get<Solution[]>(
      `/plans/${planId}/solutions`,
      params as Record<string, unknown>
    );
  }

  /**
   * Get single solution
   */
  public get(planId: string, solutionId: string): Observable<Solution> {
    return this.api.get<Solution>(`/plans/${planId}/solutions/${solutionId}`);
  }

  /**
   * Create/propose new solution
   */
  public create(planId: string, dto: CreateSolutionDto): Observable<Solution> {
    return this.api.post<Solution>(`/plans/${planId}/solutions`, dto);
  }

  /**
   * Update solution
   */
  public update(planId: string, solutionId: string, dto: UpdateSolutionDto): Observable<Solution> {
    return this.api.patch<Solution>(`/plans/${planId}/solutions/${solutionId}`, dto);
  }

  /**
   * Delete solution
   */
  public delete(planId: string, solutionId: string): Observable<void> {
    return this.api.delete<void>(`/plans/${planId}/solutions/${solutionId}`);
  }

  /**
   * Select solution
   */
  public select(planId: string, solutionId: string, dto: SelectSolutionDto): Observable<void> {
    return this.api.post<void>(`/plans/${planId}/solutions/${solutionId}/select`, dto);
  }

  /**
   * Compare multiple solutions
   */
  public compare(planId: string, solutionIds: string[], aspects?: string[]): Observable<SolutionComparison> {
    return this.api.post<SolutionComparison>(`/plans/${planId}/solutions/compare`, { solutionIds, aspects });
  }

  /**
   * Get solution version history
   */
  public getHistory(planId: string, solutionId: string): Observable<VersionHistory<Solution>> {
    return this.api.get<VersionHistory<Solution>>(`/plans/${planId}/solutions/${solutionId}/history`);
  }

  /**
   * Get solution diff between versions
   */
  public getDiff(planId: string, solutionId: string, version1: number, version2: number): Observable<unknown> {
    return this.api.get(`/plans/${planId}/solutions/${solutionId}/diff`, { version1, version2 });
  }
}
