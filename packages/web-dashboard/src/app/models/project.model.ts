/**
 * Project entity types
 */

export interface ProjectConfig {
  projectId: string;
  name?: string;
  description?: string;
}

export interface ProjectInfo {
  id: string;
  name?: string;
  path?: string;
  plansCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * DTOs for API operations
 */
export interface InitProjectDto {
  projectId: string;
  workspacePath: string;
}

export interface ListProjectsParams {
  limit?: number;
  offset?: number;
}

export interface DeleteProjectParams {
  workspacePath: string;
}

export interface ListProjectsResponse {
  projects: ProjectInfo[];
  total: number;
  hasMore: boolean;
}

export interface InitProjectResponse {
  success: boolean;
  projectId: string;
  configPath: string;
}

export interface DeleteProjectResponse {
  success: boolean;
}
