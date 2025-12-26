import { Injectable, inject } from '@angular/core';
import { type Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { ApiService } from './api.service';
import type {
  ProjectInfo,
  InitProjectDto,
  ListProjectsParams,
  DeleteProjectParams,
  ListProjectsResponse,
  InitProjectResponse,
  DeleteProjectResponse
} from '../../../models';

/**
 * Service for Project API operations
 */
@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private readonly api = inject(ApiService);

  /**
   * Initialize a new project
   */
  public init(dto: InitProjectDto): Observable<InitProjectResponse> {
    return this.api.post<InitProjectResponse>('/projects', dto);
  }

  /**
   * Get project information by ID
   */
  public get(projectId: string): Observable<ProjectInfo> {
    return this.api.get<ProjectInfo>(`/projects/${projectId}`);
  }

  /**
   * List all projects with optional pagination
   */
  public list(params?: ListProjectsParams): Observable<ProjectInfo[]> {
    return this.api.get<ListProjectsResponse>('/projects', params as Record<string, unknown>).pipe(
      map(response => response.projects)
    );
  }

  /**
   * Delete project configuration
   */
  public delete(projectId: string, params: DeleteProjectParams): Observable<DeleteProjectResponse> {
    // DELETE with query params - need to construct URL with params
    const queryString = `workspacePath=${encodeURIComponent(params.workspacePath)}`;
    return this.api.delete<DeleteProjectResponse>(`/projects/${projectId}?${queryString}`);
  }
}
