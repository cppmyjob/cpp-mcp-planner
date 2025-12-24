import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiService } from './api.service';
import type {
  Artifact,
  AddArtifactDto,
  UpdateArtifactDto,
  ListArtifactsParams,
  VersionHistory
} from '../../../models';

interface ArtifactsListResponse {
  artifacts: Artifact[];
  total: number;
  hasMore: boolean;
}

/**
 * Service for Artifact API operations
 */
@Injectable({
  providedIn: 'root'
})
export class ArtifactService {
  private readonly api = inject(ApiService);

  /**
   * List artifacts for plan
   */
  public list(planId: string, params?: ListArtifactsParams): Observable<Artifact[]> {
    return this.api.get<ArtifactsListResponse>(
      `/plans/${planId}/artifacts`,
      params as Record<string, unknown>
    ).pipe(
      map(response => response.artifacts)
    );
  }

  /**
   * Get single artifact
   */
  public get(
    planId: string,
    artifactId: string,
    options?: { includeContent?: boolean }
  ): Observable<Artifact> {
    return this.api.get<Artifact>(
      `/plans/${planId}/artifacts/${artifactId}`,
      options as Record<string, unknown>
    );
  }

  /**
   * Add new artifact
   */
  public add(planId: string, dto: AddArtifactDto): Observable<Artifact> {
    return this.api.post<Artifact>(`/plans/${planId}/artifacts`, dto);
  }

  /**
   * Update artifact
   */
  public update(planId: string, artifactId: string, dto: UpdateArtifactDto): Observable<Artifact> {
    return this.api.patch<Artifact>(`/plans/${planId}/artifacts/${artifactId}`, dto);
  }

  /**
   * Delete artifact
   */
  public delete(planId: string, artifactId: string): Observable<void> {
    return this.api.delete<void>(`/plans/${planId}/artifacts/${artifactId}`);
  }

  /**
   * Get artifact version history
   */
  public getHistory(planId: string, artifactId: string): Observable<VersionHistory<Artifact>> {
    return this.api.get<VersionHistory<Artifact>>(`/plans/${planId}/artifacts/${artifactId}/history`);
  }

  /**
   * Get artifact diff between versions
   */
  public getDiff(planId: string, artifactId: string, version1: number, version2: number): Observable<unknown> {
    return this.api.get(`/plans/${planId}/artifacts/${artifactId}/diff`, { version1, version2 });
  }
}
