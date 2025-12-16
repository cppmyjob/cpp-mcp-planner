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
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS DI requires runtime class reference
import { LinkingService } from '@mcp-planner/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import { CreateLinkDto, GetLinksQueryDto } from './dto/index.js';

/**
 * Links API Controller
 *
 * UI Usage:
 * - Entity Graph: GET links (all edges)
 * - Detail Sidebar: GET links (traceability section)
 * - Create Link Dialog: POST link
 */
@ApiTags('links')
@Controller('plans/:planId/links')
export class LinksController {
  constructor(private readonly linkingService: LinkingService) {}

  /**
   * POST /api/v1/plans/:planId/links - Create link
   * UI: Create Link Dialog in Entity Graph
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new link between entities' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 201, description: 'Link created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error or circular dependency detected' })
  @ApiResponse({ status: 404, description: 'Plan or entity not found' })
  @ApiResponse({ status: 409, description: 'Link already exists' })
  public async create(
    @Param('planId') planId: string,
    @Body() dto: CreateLinkDto
  ): Promise<unknown> {
    return this.linkingService.linkEntities({
      planId,
      sourceId: dto.sourceId,
      targetId: dto.targetId,
      relationType: dto.relationType,
      metadata: dto.metadata,
    });
  }

  /**
   * GET /api/v1/plans/:planId/links - Get links
   * UI: Entity Graph edges, Detail Sidebar traceability
   */
  @Get()
  @ApiOperation({ summary: 'Get entity links with optional filters' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: 200, description: 'Links retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  public async getLinks(
    @Param('planId') planId: string,
    @Query() query: GetLinksQueryDto
  ): Promise<unknown> {
    // If entityId is provided, get links for specific entity
    if (query.entityId !== undefined && query.entityId !== '') {
      return this.linkingService.getEntityLinks({
        planId,
        entityId: query.entityId,
        relationType: query.relationType,
        direction: query.direction,
      });
    }

    // Otherwise, return all links (for Entity Graph)
    // Note: LinkingService doesn't have a method to get all links,
    // but we can use the repository directly through a new method if needed
    // For now, require entityId
    throw new BadRequestException('entityId query parameter is required');
  }

  /**
   * DELETE /api/v1/plans/:planId/links/:id - Delete link
   * UI: Detail Sidebar unlink action
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a link' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Link ID' })
  @ApiResponse({ status: 200, description: 'Link deleted successfully' })
  @ApiResponse({ status: 404, description: 'Link not found' })
  public async delete(
    @Param('planId') planId: string,
    @Param('id') linkId: string
  ): Promise<unknown> {
    return this.linkingService.unlinkEntities({
      planId,
      linkId,
    });
  }
}
