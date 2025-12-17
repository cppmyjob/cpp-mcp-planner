import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';

import { ApiService } from './api.service';
import type {
  Decision,
  CreateDecisionDto,
  UpdateDecisionDto,
  ListDecisionsParams,
  SupersedeDecisionDto,
  VersionHistory
} from '../../../models';

/**
 * Service for Decision API operations (ADR pattern)
 */
@Injectable({
  providedIn: 'root'
})
export class DecisionService {
  private readonly api = inject(ApiService);

  /**
   * List decisions for plan
   */
  public list(planId: string, params?: ListDecisionsParams): Observable<Decision[]> {
    return this.api.get<Decision[]>(
      `/plans/${planId}/decisions`,
      params as Record<string, unknown>
    );
  }

  /**
   * Get single decision
   */
  public get(planId: string, decisionId: string): Observable<Decision> {
    return this.api.get<Decision>(`/plans/${planId}/decisions/${decisionId}`);
  }

  /**
   * Record new decision
   */
  public create(planId: string, dto: CreateDecisionDto): Observable<Decision> {
    return this.api.post<Decision>(`/plans/${planId}/decisions`, dto);
  }

  /**
   * Update decision
   */
  public update(planId: string, decisionId: string, dto: UpdateDecisionDto): Observable<Decision> {
    return this.api.patch<Decision>(`/plans/${planId}/decisions/${decisionId}`, dto);
  }

  /**
   * Delete decision
   */
  public delete(planId: string, decisionId: string): Observable<void> {
    return this.api.delete<void>(`/plans/${planId}/decisions/${decisionId}`);
  }

  /**
   * Supersede decision with new one
   */
  public supersede(planId: string, decisionId: string, dto: SupersedeDecisionDto): Observable<Decision> {
    return this.api.post<Decision>(`/plans/${planId}/decisions/${decisionId}/supersede`, dto);
  }

  /**
   * Get decision version history
   */
  public getHistory(planId: string, decisionId: string): Observable<VersionHistory<Decision>> {
    return this.api.get<VersionHistory<Decision>>(`/plans/${planId}/decisions/${decisionId}/history`);
  }

  /**
   * Get decision diff between versions
   */
  public getDiff(planId: string, decisionId: string, version1: number, version2: number): Observable<unknown> {
    return this.api.get(`/plans/${planId}/decisions/${decisionId}/diff`, { version1, version2 });
  }
}
