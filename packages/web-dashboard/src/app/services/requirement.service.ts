import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';

import { ApiService } from './api.service';
import type {
  Requirement,
  CreateRequirementDto,
  UpdateRequirementDto,
  ListRequirementsParams,
  VersionHistory
} from '../models';

/**
 * Service for Requirement API operations
 */
@Injectable({
  providedIn: 'root'
})
export class RequirementService {
  private readonly api = inject(ApiService);

  /**
   * List requirements for plan
   */
  public list(planId: string, params?: ListRequirementsParams): Observable<Requirement[]> {
    return this.api.get<Requirement[]>(
      `/plans/${planId}/requirements`,
      params as Record<string, unknown>
    );
  }

  /**
   * Get single requirement
   */
  public get(planId: string, requirementId: string): Observable<Requirement> {
    return this.api.get<Requirement>(`/plans/${planId}/requirements/${requirementId}`);
  }

  /**
   * Create new requirement
   */
  public create(planId: string, dto: CreateRequirementDto): Observable<Requirement> {
    return this.api.post<Requirement>(`/plans/${planId}/requirements`, dto);
  }

  /**
   * Update requirement
   */
  public update(planId: string, requirementId: string, dto: UpdateRequirementDto): Observable<Requirement> {
    return this.api.patch<Requirement>(`/plans/${planId}/requirements/${requirementId}`, dto);
  }

  /**
   * Delete requirement
   */
  public delete(planId: string, requirementId: string): Observable<void> {
    return this.api.delete<void>(`/plans/${planId}/requirements/${requirementId}`);
  }

  /**
   * Vote for requirement
   */
  public vote(planId: string, requirementId: string): Observable<void> {
    return this.api.post<void>(`/plans/${planId}/requirements/${requirementId}/vote`);
  }

  /**
   * Unvote requirement
   */
  public unvote(planId: string, requirementId: string): Observable<void> {
    return this.api.post<void>(`/plans/${planId}/requirements/${requirementId}/unvote`);
  }

  /**
   * Get requirement version history
   */
  public getHistory(planId: string, requirementId: string): Observable<VersionHistory<Requirement>> {
    return this.api.get<VersionHistory<Requirement>>(
      `/plans/${planId}/requirements/${requirementId}/history`
    );
  }

  /**
   * Get requirement diff between versions
   */
  public getDiff(planId: string, requirementId: string, version1: number, version2: number): Observable<unknown> {
    return this.api.get(`/plans/${planId}/requirements/${requirementId}/diff`, { version1, version2 });
  }
}
