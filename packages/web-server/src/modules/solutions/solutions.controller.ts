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
import type { SolutionService } from '@mcp-planner/core';
import { SOLUTION_SERVICE } from '../core/core.module.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import {
  CreateSolutionDto,
  UpdateSolutionDto,
  ListSolutionsQueryDto,
  GetSolutionQueryDto,
  GetHistoryQueryDto,
  CompareSolutionsDto,
  SelectSolutionDto,
} from './dto/index.js';

/**
 * Solutions API Controller
 *
 * UI Usage:
 * - Solutions Compare: list, compare, select
 * - Detail Sidebar: get, getHistory
 * - Entity Graph: list (for nodes)
 */
@ApiTags('solutions')
@Controller('plans/:planId/solutions')
export class SolutionsController {
  constructor(@Inject(SOLUTION_SERVICE) private readonly solutionService: SolutionService) {}

  /**
   * POST /api/v1/plans/:planId/solutions - Propose solution
   * UI: Propose Dialog in Solutions View
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Propose a new solution' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 201, description: 'Solution proposed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async create(
    @Param('planId') planId: string,
    @Body() dto: CreateSolutionDto
  ): Promise<unknown> {
    return this.solutionService.proposeSolution({
      planId,
      solution: {
        title: dto.title,
        description: dto.description,
        approach: dto.approach,
        implementationNotes: dto.implementationNotes,
        addressing: dto.addressing,
        tradeoffs: dto.tradeoffs,
        evaluation: dto.evaluation,
      },
    });
  }

  /**
   * GET /api/v1/plans/:planId/solutions - List solutions
   * UI: Solutions Compare View, Entity Graph nodes
   */
  @Get()
  @ApiOperation({ summary: 'List solutions with optional filters' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Solutions retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async list(
    @Param('planId') planId: string,
    @Query() query: ListSolutionsQueryDto
  ): Promise<unknown> {
    return this.solutionService.listSolutions({
      planId,
      filters: {
        status: query.status,
        addressingRequirement: query.addressingRequirement,
      },
      limit: query.limit,
      offset: query.offset,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
    });
  }

  /**
   * POST /api/v1/plans/:planId/solutions/compare - Compare solutions
   * UI: Solutions Compare View tradeoffs
   */
  @Post('compare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compare multiple solutions' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Comparison completed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error (need at least 2 solutions)' })
  public async compare(
    @Param('planId') planId: string,
    @Body() dto: CompareSolutionsDto
  ): Promise<unknown> {
    return this.solutionService.compareSolutions({
      planId,
      solutionIds: dto.solutionIds,
      aspects: dto.aspects,
    });
  }

  /**
   * GET /api/v1/plans/:planId/solutions/:id - Get solution
   * UI: Detail Sidebar
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a solution by ID' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Solution ID' })
  @ApiResponse({ status: 200, description: 'Solution retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Solution not found' })
  public async get(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetSolutionQueryDto
  ): Promise<unknown> {
    return this.solutionService.getSolution({
      planId,
      solutionId: id,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
    });
  }

  /**
   * PATCH /api/v1/plans/:planId/solutions/:id - Update solution
   * UI: Edit Dialog
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a solution' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Solution ID' })
  @ApiResponse({ status: 200, description: 'Solution updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Solution not found' })
  public async update(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSolutionDto
  ): Promise<unknown> {
    return this.solutionService.updateSolution({
      planId,
      solutionId: id,
      updates: {
        title: dto.title,
        description: dto.description,
        approach: dto.approach,
        implementationNotes: dto.implementationNotes,
        addressing: dto.addressing,
        tradeoffs: dto.tradeoffs,
        evaluation: dto.evaluation,
      },
    });
  }

  /**
   * DELETE /api/v1/plans/:planId/solutions/:id - Delete solution
   * UI: Detail Sidebar
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a solution' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Solution ID' })
  @ApiResponse({ status: 200, description: 'Solution deleted successfully' })
  @ApiResponse({ status: 404, description: 'Solution not found' })
  public async delete(
    @Param('planId') planId: string,
    @Param('id') id: string
  ): Promise<unknown> {
    return this.solutionService.deleteSolution({
      planId,
      solutionId: id,
    });
  }

  /**
   * POST /api/v1/plans/:planId/solutions/:id/select - Select solution
   * UI: Solutions Compare View "Select" button
   */
  @Post(':id/select')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Select a solution (marks as selected, optionally creates Decision)' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Solution ID' })
  @ApiResponse({ status: 200, description: 'Solution selected successfully' })
  @ApiResponse({ status: 404, description: 'Solution not found' })
  public async select(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: SelectSolutionDto
  ): Promise<unknown> {
    return this.solutionService.selectSolution({
      planId,
      solutionId: id,
      reason: dto.reason,
      createDecisionRecord: dto.createDecisionRecord,
    });
  }

  /**
   * GET /api/v1/plans/:planId/solutions/:id/history - Get solution history
   * UI: Detail Sidebar (Version History tab)
   */
  @Get(':id/history')
  @ApiOperation({ summary: 'Get solution version history' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Solution ID' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Solution not found' })
  public async getHistory(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetHistoryQueryDto
  ): Promise<unknown> {
    return this.solutionService.getHistory({
      planId,
      solutionId: id,
      limit: query.limit,
      offset: query.offset,
    });
  }
}
