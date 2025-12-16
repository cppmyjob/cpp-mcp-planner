import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import type { RequirementService } from '@mcp-planner/core';
import { REQUIREMENT_SERVICE } from '../core/core.module.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import {
  CreateRequirementDto,
  UpdateRequirementDto,
  ListRequirementsQueryDto,
  GetRequirementQueryDto,
  GetHistoryQueryDto,
} from './dto/index.js';

/**
 * Requirements API Controller
 *
 * UI Usage:
 * - Kanban Board: list (group by status), update (drag-drop), vote/unvote
 * - Detail Sidebar: get, getHistory
 * - Add Dialog: add
 */
@ApiTags('requirements')
@Controller('plans/:planId/requirements')
export class RequirementsController {
  constructor(@Inject(REQUIREMENT_SERVICE) private readonly requirementService: RequirementService) {}

  /**
   * POST /api/v1/plans/:planId/requirements - Add requirement
   * UI: Add Dialog in Kanban Board
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new requirement' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 201, description: 'Requirement created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async create(
    @Param('planId') planId: string,
    @Body() dto: CreateRequirementDto
  ): Promise<unknown> {
    return this.requirementService.addRequirement({
      planId,
      requirement: {
        title: dto.title,
        description: dto.description,
        source: dto.source,
        priority: dto.priority,
        category: dto.category,
        status: dto.status,
        acceptanceCriteria: dto.acceptanceCriteria,
        rationale: dto.rationale,
      },
    });
  }

  /**
   * GET /api/v1/plans/:planId/requirements - List requirements
   * UI: Kanban Board columns (filtered by status)
   */
  @Get()
  @ApiOperation({ summary: 'List requirements with optional filters' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Requirements retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async list(
    @Param('planId') planId: string,
    @Query() query: ListRequirementsQueryDto
  ): Promise<unknown> {
    return this.requirementService.listRequirements({
      planId,
      filters: {
        status: query.status,
        priority: query.priority,
        category: query.category,
      },
      limit: query.limit,
      offset: query.offset,
      fields: query.fields,
    });
  }

  /**
   * GET /api/v1/plans/:planId/requirements/:id - Get requirement
   * UI: Detail Sidebar
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a requirement by ID' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Requirement ID' })
  @ApiResponse({ status: 200, description: 'Requirement retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Requirement not found' })
  public async get(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetRequirementQueryDto
  ): Promise<unknown> {
    return this.requirementService.getRequirement({
      planId,
      requirementId: id,
      includeTraceability: query.includeTraceability,
      fields: query.fields,
    });
  }

  /**
   * PATCH /api/v1/plans/:planId/requirements/:id - Update requirement
   * UI: Edit Dialog, Kanban drag-drop (status only)
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a requirement' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Requirement ID' })
  @ApiResponse({ status: 200, description: 'Requirement updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Requirement not found' })
  public async update(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRequirementDto
  ): Promise<unknown> {
    return this.requirementService.updateRequirement({
      planId,
      requirementId: id,
      updates: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        category: dto.category,
        status: dto.status,
        acceptanceCriteria: dto.acceptanceCriteria,
        rationale: dto.rationale,
      },
    });
  }

  /**
   * DELETE /api/v1/plans/:planId/requirements/:id - Delete requirement
   * UI: Detail Sidebar
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a requirement' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Requirement ID' })
  @ApiResponse({ status: 200, description: 'Requirement deleted successfully' })
  @ApiResponse({ status: 404, description: 'Requirement not found' })
  public async delete(
    @Param('planId') planId: string,
    @Param('id') id: string
  ): Promise<unknown> {
    return this.requirementService.deleteRequirement({
      planId,
      requirementId: id,
    });
  }

  /**
   * POST /api/v1/plans/:planId/requirements/:id/vote - Vote for requirement
   * UI: Kanban card button
   */
  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vote for a requirement' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Requirement ID' })
  @ApiResponse({ status: 200, description: 'Vote recorded successfully' })
  @ApiResponse({ status: 404, description: 'Requirement not found' })
  public async vote(
    @Param('planId') planId: string,
    @Param('id') id: string
  ): Promise<unknown> {
    return this.requirementService.voteForRequirement({
      planId,
      requirementId: id,
    });
  }

  /**
   * POST /api/v1/plans/:planId/requirements/:id/unvote - Unvote requirement
   * UI: Kanban card button
   */
  @Post(':id/unvote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove vote from a requirement' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Requirement ID' })
  @ApiResponse({ status: 200, description: 'Vote removed successfully' })
  @ApiResponse({ status: 404, description: 'Requirement not found' })
  public async unvote(
    @Param('planId') planId: string,
    @Param('id') id: string
  ): Promise<unknown> {
    return this.requirementService.unvoteRequirement({
      planId,
      requirementId: id,
    });
  }

  /**
   * GET /api/v1/plans/:planId/requirements/:id/history - Get requirement history
   * UI: Detail Sidebar (Version History tab)
   */
  @Get(':id/history')
  @ApiOperation({ summary: 'Get requirement version history' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Requirement ID' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Requirement not found' })
  public async getHistory(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetHistoryQueryDto
  ): Promise<unknown> {
    return this.requirementService.getHistory({
      planId,
      requirementId: id,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
