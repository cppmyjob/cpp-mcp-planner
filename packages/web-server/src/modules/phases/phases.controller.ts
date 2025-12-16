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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS DI requires runtime class reference
import { PhaseService } from '@mcp-planner/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import {
  AddPhaseDto,
  UpdatePhaseDto,
  MovePhaseDto,
  UpdateStatusDto,
  TreeQueryDto,
  ListPhasesQueryDto,
  GetPhaseQueryDto,
  NextActionsQueryDto,
  GetHistoryQueryDto,
  DiffQueryDto,
  DeletePhaseQueryDto,
} from './dto/index.js';

/**
 * Phases API Controller
 *
 * UI Usage:
 * - Phase Tree: getTree, move, updateStatus
 * - Dashboard: getTree (active), getNextActions
 * - Detail Sidebar: get, update, delete, history, diff
 * - Entity Graph: listPhases
 */
@ApiTags('phases')
@Controller('plans/:planId/phases')
export class PhasesController {
  constructor(private readonly phaseService: PhaseService) {}

  /**
   * POST /api/v1/plans/:planId/phases - Add phase
   * UI: Add Phase Dialog
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new phase' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 201, description: 'Phase created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async create(
    @Param('planId') planId: string,
    @Body() dto: AddPhaseDto
  ): Promise<unknown> {
    return this.phaseService.addPhase({
      planId,
      phase: {
        title: dto.title,
        description: dto.description,
        objectives: dto.objectives,
        deliverables: dto.deliverables,
        successCriteria: dto.successCriteria,
        parentId: dto.parentId,
        priority: dto.priority,
        implementationNotes: dto.implementationNotes,
      },
    });
  }

  /**
   * GET /api/v1/plans/:planId/phases/tree - Get phase tree
   * UI: Phase Tree hierarchy (p-tree)
   */
  @Get('tree')
  @ApiOperation({ summary: 'Get phase tree hierarchy' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Tree retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async getTree(
    @Param('planId') planId: string,
    @Query() query: TreeQueryDto
  ): Promise<unknown> {
    return this.phaseService.getPhaseTree({
      planId,
      maxDepth: query.maxDepth,
      includeCompleted: query.includeCompleted,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
      excludeComputed: query.excludeComputed,
    });
  }

  /**
   * GET /api/v1/plans/:planId/phases/next-actions - Get next actions
   * UI: Dashboard blockers and actionable items
   */
  @Get('next-actions')
  @ApiOperation({ summary: 'Get next actionable phases' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Next actions retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid limit parameter' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async getNextActions(
    @Param('planId') planId: string,
    @Query() query: NextActionsQueryDto
  ): Promise<unknown> {
    return this.phaseService.getNextActions({
      planId,
      limit: query.limit,
    });
  }

  /**
   * GET /api/v1/plans/:planId/phases - List phases by IDs
   * UI: Entity Graph nodes
   */
  @Get()
  @ApiOperation({ summary: 'List multiple phases by IDs' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Phases retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Missing phaseIds parameter' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async list(
    @Param('planId') planId: string,
    @Query() query: ListPhasesQueryDto
  ): Promise<unknown> {
    return this.phaseService.getPhases({
      planId,
      phaseIds: query.phaseIds,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
      excludeComputed: query.excludeComputed,
    });
  }

  /**
   * GET /api/v1/plans/:planId/phases/:id - Get phase
   * UI: Detail Sidebar
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a phase by ID' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Phase ID' })
  @ApiResponse({ status: 200, description: 'Phase retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  public async get(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetPhaseQueryDto
  ): Promise<unknown> {
    return this.phaseService.getPhase({
      planId,
      phaseId: id,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
      excludeComputed: query.excludeComputed,
    });
  }

  /**
   * PATCH /api/v1/plans/:planId/phases/:id - Update phase
   * UI: Edit Dialog
   */
  @Patch(':id')
  @ApiOperation({ summary: 'Update a phase' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Phase ID' })
  @ApiResponse({ status: 200, description: 'Phase updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  public async update(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePhaseDto
  ): Promise<unknown> {
    return this.phaseService.updatePhase({
      planId,
      phaseId: id,
      updates: {
        title: dto.title,
        description: dto.description,
        objectives: dto.objectives,
        deliverables: dto.deliverables,
        successCriteria: dto.successCriteria,
        priority: dto.priority,
        implementationNotes: dto.implementationNotes,
        progress: dto.progress,
      },
    });
  }

  /**
   * DELETE /api/v1/plans/:planId/phases/:id - Delete phase
   * UI: Detail Sidebar delete action
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a phase' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Phase ID' })
  @ApiResponse({ status: 200, description: 'Phase deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete phase with children without deleteChildren flag' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  public async delete(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: DeletePhaseQueryDto
  ): Promise<unknown> {
    return this.phaseService.deletePhase({
      planId,
      phaseId: id,
      deleteChildren: query.deleteChildren,
    });
  }

  /**
   * POST /api/v1/plans/:planId/phases/:id/move - Move phase
   * UI: Tree drag-drop
   */
  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a phase to a different parent or order' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Phase ID' })
  @ApiResponse({ status: 200, description: 'Phase moved successfully' })
  @ApiResponse({ status: 400, description: 'Invalid move parameters' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  public async move(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: MovePhaseDto
  ): Promise<unknown> {
    return this.phaseService.movePhase({
      planId,
      phaseId: id,
      newParentId: dto.newParentId,
      newOrder: dto.newOrder,
    });
  }

  /**
   * PATCH /api/v1/plans/:planId/phases/:id/status - Update status
   * UI: Progress/status updates
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update phase status and progress' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Phase ID' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  public async updateStatus(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto
  ): Promise<unknown> {
    return this.phaseService.updatePhaseStatus({
      planId,
      phaseId: id,
      status: dto.status,
      progress: dto.progress,
      actualEffort: dto.actualEffort,
      notes: dto.notes,
    });
  }

  /**
   * GET /api/v1/plans/:planId/phases/:id/history - Get phase history
   * UI: Detail Sidebar (Version History tab)
   */
  @Get(':id/history')
  @ApiOperation({ summary: 'Get phase version history' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Phase ID' })
  @ApiResponse({ status: 200, description: 'History retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  public async getHistory(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetHistoryQueryDto
  ): Promise<unknown> {
    return this.phaseService.getHistory({
      planId,
      phaseId: id,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * GET /api/v1/plans/:planId/phases/:id/diff - Compare versions
   * UI: Detail Sidebar (Version Compare)
   */
  @Get(':id/diff')
  @ApiOperation({ summary: 'Compare two versions of a phase' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Phase ID' })
  @ApiResponse({ status: 200, description: 'Diff retrieved successfully' })
  @ApiResponse({ status: 400, description: 'Missing version parameters' })
  @ApiResponse({ status: 404, description: 'Phase not found' })
  public async diff(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: DiffQueryDto
  ): Promise<unknown> {
    if (query.version1 === undefined || query.version2 === undefined) {
      throw new BadRequestException('Both version1 and version2 query parameters are required');
    }
    return this.phaseService.diff({
      planId,
      phaseId: id,
      version1: query.version1,
      version2: query.version2,
    });
  }
}
