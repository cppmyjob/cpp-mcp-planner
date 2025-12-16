import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS DI requires runtime class reference
import { DecisionService } from '@mcp-planner/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import {
  CreateDecisionDto,
  UpdateDecisionDto,
  SupersedeDecisionDto,
  ListDecisionsQueryDto,
  GetDecisionQueryDto,
  GetHistoryQueryDto,
  DiffQueryDto,
} from './dto/index.js';

/**
 * Decisions API Controller
 *
 * UI Usage:
 * - Decisions Timeline: list (sorted by date), supersede
 * - Detail Sidebar: get, history
 * - Entity Graph: list (for nodes)
 */
@ApiTags('decisions')
@Controller('plans/:planId/decisions')
export class DecisionsController {
  constructor(private readonly decisionService: DecisionService) {}

  /**
   * POST /api/v1/plans/:planId/decisions - Record decision
   * UI: Record Decision Dialog
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a new decision' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 201, description: 'Decision recorded successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async create(
    @Param('planId') planId: string,
    @Body() dto: CreateDecisionDto
  ): Promise<unknown> {
    return this.decisionService.recordDecision({
      planId,
      decision: {
        title: dto.title,
        question: dto.question,
        decision: dto.decision,
        context: dto.context,
        consequences: dto.consequences,
        alternativesConsidered: dto.alternativesConsidered,
      },
    });
  }

  /**
   * GET /api/v1/plans/:planId/decisions - List decisions
   * UI: Decisions Timeline, Entity Graph nodes
   */
  @Get()
  @ApiOperation({ summary: 'List decisions with optional filters' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Decisions retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async list(
    @Param('planId') planId: string,
    @Query() query: ListDecisionsQueryDto
  ): Promise<unknown> {
    return this.decisionService.listDecisions({
      planId,
      filters: {
        status: query.status,
      },
      limit: query.limit,
      offset: query.offset,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
    });
  }

  /**
   * GET /api/v1/plans/:planId/decisions/:id - Get decision
   * UI: Detail Sidebar
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a decision by ID' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Decision ID' })
  @ApiResponse({ status: 200, description: 'Decision retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Decision not found' })
  public async get(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetDecisionQueryDto
  ): Promise<unknown> {
    return this.decisionService.getDecision({
      planId,
      decisionId: id,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
    });
  }

  /**
   * PATCH /api/v1/plans/:planId/decisions/:id - Update decision
   * UI: Edit Dialog
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a decision' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Decision ID' })
  @ApiResponse({ status: 200, description: 'Decision updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Decision not found' })
  public async update(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDecisionDto
  ): Promise<unknown> {
    return this.decisionService.updateDecision({
      planId,
      decisionId: id,
      updates: {
        title: dto.title,
        question: dto.question,
        decision: dto.decision,
        context: dto.context,
        consequences: dto.consequences,
        alternativesConsidered: dto.alternativesConsidered,
      },
    });
  }

  /**
   * POST /api/v1/plans/:planId/decisions/:id/supersede - Supersede decision
   * UI: Timeline "supersede" action
   */
  @Post(':id/supersede')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Supersede a decision with a new one' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Decision ID to supersede' })
  @ApiResponse({ status: 201, description: 'Decision superseded successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or already superseded' })
  @ApiResponse({ status: 404, description: 'Decision not found' })
  public async supersede(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: SupersedeDecisionDto
  ): Promise<unknown> {
    return this.decisionService.supersedeDecision({
      planId,
      decisionId: id,
      newDecision: {
        decision: dto.newDecision.decision,
        context: dto.newDecision.context,
        consequences: dto.newDecision.consequences,
      },
      reason: dto.reason,
    });
  }

  /**
   * GET /api/v1/plans/:planId/decisions/:id/history - Get decision history
   * UI: Detail Sidebar (Version History tab)
   */
  @Get(':id/history')
  @ApiOperation({ summary: 'Get decision version history' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Decision ID' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Decision not found' })
  public async getHistory(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetHistoryQueryDto
  ): Promise<unknown> {
    return this.decisionService.getHistory({
      planId,
      decisionId: id,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * GET /api/v1/plans/:planId/decisions/:id/diff - Compare versions
   * UI: Detail Sidebar (Version Compare)
   */
  @Get(':id/diff')
  @ApiOperation({ summary: 'Compare two versions of a decision' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Decision ID' })
  @ApiResponse({ status: 200, description: 'Diff retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Missing version parameters' })
  @ApiResponse({ status: 404, description: 'Decision not found' })
  public async diff(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: DiffQueryDto
  ): Promise<unknown> {
    if (query.version1 === undefined || query.version2 === undefined) {
      throw new BadRequestException('Both version1 and version2 query parameters are required');
    }
    return this.decisionService.diff({
      planId,
      decisionId: id,
      version1: query.version1,
      version2: query.version2,
    });
  }
}
