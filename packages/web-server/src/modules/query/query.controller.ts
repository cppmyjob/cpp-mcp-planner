import {
  Controller,
  Get,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS DI requires runtime class reference
import { QueryService } from '@mcp-planner/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import { SearchQueryDto, TraceQueryDto, ValidateQueryDto, ExportQueryDto } from './dto/index.js';

/**
 * Query API Controller
 *
 * UI Usage:
 * - Search: Global search bar
 * - Trace: Requirement traceability view
 * - Validate: Plan health dashboard
 * - Export: Export functionality
 */
@ApiTags('query')
@Controller('plans/:planId/query')
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  /**
   * GET /api/v1/plans/:planId/query/search - Search entities
   * UI: Global search bar
   */
  @Get('search')
  @ApiOperation({ summary: 'Search entities across plan' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Search results returned' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async search(
    @Param('planId') planId: string,
    @Query() queryDto: SearchQueryDto
  ): Promise<unknown> {
    return this.queryService.searchEntities({
      planId,
      query: queryDto.query,
      entityTypes: queryDto.entityTypes as ('requirement' | 'solution' | 'decision' | 'phase' | 'artifact')[] | undefined,
      filters: {
        status: queryDto.status,
        tags: queryDto.tags !== undefined
          ? Object.entries(queryDto.tags).map(([key, value]) => ({ key, value }))
          : undefined,
      },
      limit: queryDto.limit,
      offset: queryDto.offset,
    });
  }

  /**
   * GET /api/v1/plans/:planId/query/trace/:requirementId - Trace requirement
   * UI: Requirement traceability view
   */
  @Get('trace/:requirementId')
  @ApiOperation({ summary: 'Trace requirement implementation path' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'requirementId', description: 'Requirement ID to trace' })
  @ApiResponse({ status: 200, description: 'Trace result returned' })
  @ApiResponse({ status: 404, description: 'Plan or requirement not found' })
  public async trace(
    @Param('planId') planId: string,
    @Param('requirementId') requirementId: string,
    @Query() queryDto: TraceQueryDto
  ): Promise<unknown> {
    return this.queryService.traceRequirement({
      planId,
      requirementId,
      depth: queryDto.depth,
      includePhases: queryDto.includePhases,
      includeArtifacts: queryDto.includeArtifacts,
      limit: queryDto.limit,
      fields: queryDto.fields,
      solutionFields: queryDto.solutionFields,
      phaseFields: queryDto.phaseFields,
      excludeMetadata: queryDto.excludeMetadata,
    });
  }

  /**
   * GET /api/v1/plans/:planId/query/validate - Validate plan
   * UI: Plan health dashboard
   */
  @Get('validate')
  @ApiOperation({ summary: 'Validate plan integrity and completeness' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Validation results returned' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async validate(
    @Param('planId') planId: string,
    @Query() queryDto: ValidateQueryDto
  ): Promise<unknown> {
    return this.queryService.validatePlan({
      planId,
      checks: queryDto.checks,
      validationLevel: queryDto.validationLevel,
    });
  }

  /**
   * GET /api/v1/plans/:planId/query/export - Export plan
   * UI: Export dialog
   */
  @Get('export')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Export plan to markdown or JSON' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Plan exported successfully' })
  @ApiResponse({ status: 400, description: 'Invalid format' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async export(
    @Param('planId') planId: string,
    @Query() queryDto: ExportQueryDto
  ): Promise<unknown> {
    return this.queryService.exportPlan({
      planId,
      format: queryDto.format,
      sections: queryDto.sections,
      includeVersionHistory: queryDto.includeVersionHistory,
    });
  }
}
