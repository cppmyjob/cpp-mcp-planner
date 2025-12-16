import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS DI requires runtime class reference
import { ArtifactService } from '@mcp-planner/core';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- NestJS validation requires runtime class reference
import {
  AddArtifactDto,
  UpdateArtifactDto,
  ListArtifactsQueryDto,
  GetArtifactQueryDto,
  HistoryQueryDto,
  DiffQueryDto,
} from './dto/index.js';

@ApiTags('Artifacts')
@Controller('plans/:planId/artifacts')
export class ArtifactsController {
  constructor(private readonly artifactService: ArtifactService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new artifact' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Artifact created successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Plan or referenced entity not found' })
  public async create(
    @Param('planId') planId: string,
    @Body() dto: AddArtifactDto
  ): Promise<unknown> {
    return this.artifactService.addArtifact({
      planId,
      artifact: {
        title: dto.title,
        artifactType: dto.artifactType,
        description: dto.description,
        slug: dto.slug,
        content: dto.content,
        targets: dto.targets,
        relatedPhaseId: dto.relatedPhaseId,
        relatedSolutionId: dto.relatedSolutionId,
        relatedRequirementIds: dto.relatedRequirementIds,
        codeRefs: dto.codeRefs,
      },
    });
  }

  @Get()
  @ApiOperation({ summary: 'List all artifacts with optional filters' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Artifacts retrieved successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid query parameters' })
  public async list(
    @Param('planId') planId: string,
    @Query() query: ListArtifactsQueryDto
  ): Promise<unknown> {
    return this.artifactService.listArtifacts({
      planId,
      filters: {
        artifactType: query.artifactType as 'code' | 'config' | 'migration' | 'documentation' | 'test' | 'script' | 'other' | undefined,
        status: query.status as 'draft' | 'reviewed' | 'approved' | 'implemented' | 'outdated' | undefined,
        relatedPhaseId: query.relatedPhaseId,
      },
      limit: query.limit,
      offset: query.offset,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get artifact by ID' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Artifact ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Artifact retrieved successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Artifact not found' })
  public async get(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: GetArtifactQueryDto
  ): Promise<unknown> {
    return this.artifactService.getArtifact({
      planId,
      artifactId: id,
      fields: query.fields,
      excludeMetadata: query.excludeMetadata,
      includeContent: query.includeContent,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update artifact' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Artifact ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Artifact updated successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid input' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Artifact not found' })
  public async update(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Body() dto: UpdateArtifactDto
  ): Promise<unknown> {
    return this.artifactService.updateArtifact({
      planId,
      artifactId: id,
      updates: {
        title: dto.title,
        description: dto.description,
        slug: dto.slug,
        status: dto.status,
        content: dto.content,
        targets: dto.targets,
        relatedPhaseId: dto.relatedPhaseId,
        relatedSolutionId: dto.relatedSolutionId,
        relatedRequirementIds: dto.relatedRequirementIds,
        codeRefs: dto.codeRefs,
      },
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete artifact' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Artifact ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Artifact deleted successfully' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Artifact not found' })
  public async delete(
    @Param('planId') planId: string,
    @Param('id') id: string
  ): Promise<unknown> {
    return this.artifactService.deleteArtifact({
      planId,
      artifactId: id,
    });
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get artifact version history' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Artifact ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'History retrieved successfully' })
  public async getHistory(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: HistoryQueryDto
  ): Promise<unknown> {
    return this.artifactService.getHistory({
      planId,
      artifactId: id,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':id/diff')
  @ApiOperation({ summary: 'Compare two versions of an artifact' })
  @ApiParam({ name: 'planId', description: 'Plan ID' })
  @ApiParam({ name: 'id', description: 'Artifact ID' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Diff retrieved successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Missing version parameters' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Artifact not found' })
  public async diff(
    @Param('planId') planId: string,
    @Param('id') id: string,
    @Query() query: DiffQueryDto
  ): Promise<unknown> {
    return this.artifactService.diff({
      planId,
      artifactId: id,
      version1: query.version1,
      version2: query.version2,
    });
  }
}
