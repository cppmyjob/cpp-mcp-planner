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
import type { PlanService } from '@mcp-planner/core';
import { PLAN_SERVICE } from '../core/core.module.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import {
  CreatePlanDto,
  UpdatePlanDto,
  ListPlansQueryDto,
  GetPlanQueryDto,
  ActivatePlanDto,
  GetActivePlanQueryDto,
  DeletePlanQueryDto,
} from './dto/index.js';

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(@Inject(PLAN_SERVICE) private readonly planService: PlanService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new plan' })
  @ApiResponse({ status: 201, description: 'Plan created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async create(@Body() dto: CreatePlanDto): Promise<unknown> {
    return this.planService.createPlan({
      name: dto.name,
      description: dto.description,
      author: dto.author,
      enableHistory: dto.enableHistory,
      maxHistoryDepth: dto.maxHistoryDepth,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all plans' })
  @ApiResponse({ status: 200, description: 'Plans retrieved successfully' })
  public async list(@Query() query: ListPlansQueryDto): Promise<unknown> {
    return this.planService.listPlans({
      status: query.status,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });
  }

  @Get('active')
  @ApiOperation({ summary: 'Get the active plan for a workspace' })
  @ApiResponse({ status: 200, description: 'Active plan retrieved' })
  public async getActive(@Query() query: GetActivePlanQueryDto): Promise<unknown> {
    return this.planService.getActivePlan({
      workspacePath: query.workspacePath,
      includeGuide: query.includeGuide,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a plan by ID' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async get(@Param('id') id: string, @Query() query: GetPlanQueryDto): Promise<unknown> {
    return this.planService.getPlan({
      planId: id,
      includeEntities: query.includeEntities,
    });
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Get plan summary' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Summary retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async getSummary(@Param('id') id: string): Promise<unknown> {
    return this.planService.getSummary({ planId: id });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a plan' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async update(@Param('id') id: string, @Body() dto: UpdatePlanDto): Promise<unknown> {
    return this.planService.updatePlan({
      planId: id,
      updates: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        enableHistory: dto.enableHistory,
        maxHistoryDepth: dto.maxHistoryDepth,
      },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive or permanently delete a plan' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan deleted/archived successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async delete(@Param('id') id: string, @Query() query: DeletePlanQueryDto): Promise<unknown> {
    return this.planService.archivePlan({
      planId: id,
      permanent: query.permanent,
    });
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set plan as active for a workspace' })
  @ApiParam({ name: 'id', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan activated successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async activate(@Param('id') id: string, @Body() dto: ActivatePlanDto): Promise<unknown> {
    return this.planService.setActivePlan({
      planId: id,
      workspacePath: dto.workspacePath,
    });
  }
}
