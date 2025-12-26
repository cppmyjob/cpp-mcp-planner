import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { ProjectService } from '@mcp-planner/core';
import { PROJECT_SERVICE } from '../core/core.module.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import {
  InitProjectDto,
  ListProjectsQueryDto,
  DeleteProjectQueryDto,
} from './dto/index.js';

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(@Inject(PROJECT_SERVICE) private readonly projectService: ProjectService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initialize a new project' })
  @ApiResponse({ status: 201, description: 'Project initialized successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Project already exists' })
  public async init(@Body() dto: InitProjectDto): Promise<unknown> {
    return this.projectService.initProject(dto.workspacePath, {
      projectId: dto.projectId,
    });
  }

  @Get(':projectId')
  @ApiOperation({ summary: 'Get project information' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  public async get(
    @Param('projectId') projectId: string
  ): Promise<unknown> {
    const result = await this.projectService.getProjectInfo(projectId);
    if (result === null) {
      throw new Error('Project not found');
    }
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'List all projects' })
  @ApiResponse({ status: 200, description: 'Projects retrieved successfully' })
  public async list(@Query() query: ListProjectsQueryDto): Promise<unknown> {
    return this.projectService.listProjects({
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Delete(':projectId')
  @ApiOperation({ summary: 'Delete project configuration' })
  @ApiParam({ name: 'projectId', description: 'Project ID' })
  @ApiResponse({ status: 200, description: 'Project deleted successfully' })
  @ApiResponse({ status: 404, description: 'Project not found' })
  public async delete(
    @Param('projectId') projectId: string,
    @Query() query: DeleteProjectQueryDto
  ): Promise<unknown> {
    // Check if config exists first
    const existing = await this.projectService.getProject(query.workspacePath);
    if (existing === null) {
      throw new Error('Project not found');
    }
    return this.projectService.deleteProject(query.workspacePath);
  }
}
