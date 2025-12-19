import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiService } from './api.service';
import type {
  Phase,
  AddPhaseDto,
  UpdatePhaseDto,
  MovePhaseDto,
  UpdatePhaseStatusDto,
  GetPhaseTreeParams,
  ListPhasesParams,
  PhaseTreeNode,
  NextAction,
  VersionHistory
} from '../../../models';

interface PhasesListResponse {
  phases: Phase[];
  notFound?: string[];
}

/**
 * Service for Phase API operations
 */
@Injectable({
  providedIn: 'root'
})
export class PhaseService {
  private readonly api = inject(ApiService);

  /**
   * List phases for plan (by IDs or filters)
   */
  public list(planId: string, params?: ListPhasesParams): Observable<Phase[]> {
    return this.api.get<PhasesListResponse>(
      `/plans/${planId}/phases`,
      params as Record<string, unknown>
    ).pipe(
      map(response => response.phases)
    );
  }

  /**
   * Get phase tree
   */
  public getTree(planId: string, params?: GetPhaseTreeParams): Observable<PhaseTreeNode[]> {
    return this.api.get<{ tree: PhaseTreeNode[] }>(
      `/plans/${planId}/phases/tree`,
      params as Record<string, unknown>
    ).pipe(
      map(response => response.tree)
    );
  }

  /**
   * Get single phase
   */
  public get(planId: string, phaseId: string): Observable<Phase> {
    return this.api.get<Phase>(`/plans/${planId}/phases/${phaseId}`);
  }

  /**
   * Add new phase
   */
  public add(planId: string, dto: AddPhaseDto): Observable<Phase> {
    return this.api.post<Phase>(`/plans/${planId}/phases`, dto);
  }

  /**
   * Update phase
   */
  public update(planId: string, phaseId: string, dto: UpdatePhaseDto): Observable<Phase> {
    return this.api.patch<Phase>(`/plans/${planId}/phases/${phaseId}`, dto);
  }

  /**
   * Update phase status
   */
  public updateStatus(planId: string, phaseId: string, dto: UpdatePhaseStatusDto): Observable<void> {
    return this.api.patch<void>(`/plans/${planId}/phases/${phaseId}/status`, dto);
  }

  /**
   * Move phase to new parent/position
   */
  public move(planId: string, phaseId: string, dto: MovePhaseDto): Observable<void> {
    return this.api.post<void>(`/plans/${planId}/phases/${phaseId}/move`, dto);
  }

  /**
   * Delete phase
   */
  public delete(planId: string, phaseId: string, deleteChildren?: boolean): Observable<void> {
    const url = deleteChildren
      ? `/plans/${planId}/phases/${phaseId}?deleteChildren=true`
      : `/plans/${planId}/phases/${phaseId}`;
    return this.api.delete<void>(url);
  }

  /**
   * Get next actionable phases
   */
  public getNextActions(planId: string, limit?: number): Observable<NextAction[]> {
    return this.api.get<NextAction[]>(
      `/plans/${planId}/phases/next-actions`,
      limit ? { limit } : undefined
    );
  }

  /**
   * Complete phase and advance to next
   */
  public completeAndAdvance(planId: string, phaseId: string, notes?: string): Observable<void> {
    return this.api.post<void>(`/plans/${planId}/phases/${phaseId}/complete`, { notes });
  }

  /**
   * Get phase version history
   */
  public getHistory(planId: string, phaseId: string): Observable<VersionHistory<Phase>> {
    return this.api.get<VersionHistory<Phase>>(`/plans/${planId}/phases/${phaseId}/history`);
  }

  /**
   * Get phase diff between versions
   */
  public getDiff(planId: string, phaseId: string, version1: number, version2: number): Observable<unknown> {
    return this.api.get(`/plans/${planId}/phases/${phaseId}/diff`, { version1, version2 });
  }
}
