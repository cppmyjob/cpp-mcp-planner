import type { Services } from '../services.js';
import type { InitProjectInput, ListProjectsInput } from '@mcp-planner/core';
import { ToolError, createSuccessResponse, type ToolResult } from './types.js';

// GREEN: Phase 4.14 - Project tool handler for init action
// GREEN: Phase 4.15 - Added CRUD action handlers (get, list, delete)

interface ProjectArgs {
  action: string;
  [key: string]: unknown;
}

export async function handleProject(args: ProjectArgs, services: Services): Promise<ToolResult> {
  const { projectService } = services;
  const { action } = args;

  let result: unknown;

  switch (action) {
    case 'init': {
      // Extract workspacePath and build config from args
      const { workspacePath, projectId, name, description } = args as unknown as {
        workspacePath: string;
        projectId: string;
        name?: string;
        description?: string;
      };

      const input: InitProjectInput = {
        workspacePath,
        config: {
          projectId,
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
        },
      };

      result = await projectService.initProject(workspacePath, input.config);
      break;
    }

    case 'get': {
      const { workspacePath } = args as unknown as {
        workspacePath: string;
      };

      result = await projectService.getProject(workspacePath);
      break;
    }

    case 'list': {
      const { limit, offset } = args as unknown as {
        limit?: number;
        offset?: number;
      };

      const input: ListProjectsInput = {
        ...(limit !== undefined && { limit }),
        ...(offset !== undefined && { offset }),
      };

      result = await projectService.listProjects(input);
      break;
    }

    case 'delete': {
      const { workspacePath } = args as unknown as {
        workspacePath: string;
      };

      result = await projectService.deleteProject(workspacePath);
      break;
    }

    default:
      throw new ToolError('InvalidAction', `Unknown action for project: ${action}`);
  }

  return createSuccessResponse(result);
}
