import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsArray, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import type { SolutionStatus } from '@mcp-planner/core';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const VALID_STATUSES: SolutionStatus[] = ['proposed', 'selected', 'rejected'];

/**
 * Query parameters for listing solutions
 * Used by: Solutions Compare View, Entity Graph
 */
export class ListSolutionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: VALID_STATUSES })
  @IsString()
  @IsIn(VALID_STATUSES)
  @IsOptional()
  public status?: SolutionStatus;

  @ApiPropertyOptional({ description: 'Filter by requirement ID being addressed' })
  @IsString()
  @IsOptional()
  public addressingRequirement?: string;

  @ApiPropertyOptional({ description: 'Number of items to return', default: DEFAULT_LIMIT, maximum: MAX_LIMIT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  @IsOptional()
  public limit?: number;

  @ApiPropertyOptional({ description: 'Number of items to skip', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  public offset?: number;

  @ApiPropertyOptional({ description: 'Fields to include (comma-separated or * for all)' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (typeof value === 'string') {
      return value.split(',').map((f: string) => f.trim());
    }
    return value;
  })
  public fields?: string[];

  @ApiPropertyOptional({ description: 'Exclude metadata fields' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return false;
  })
  @IsBoolean()
  @IsOptional()
  public excludeMetadata?: boolean;
}

/**
 * Query parameters for getting a single solution
 */
export class GetSolutionQueryDto {
  @ApiPropertyOptional({ description: 'Fields to include (comma-separated or * for all)' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (typeof value === 'string') {
      return value.split(',').map((f: string) => f.trim());
    }
    return value;
  })
  public fields?: string[];

  @ApiPropertyOptional({ description: 'Exclude metadata fields' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return false;
  })
  @IsBoolean()
  @IsOptional()
  public excludeMetadata?: boolean;
}

/**
 * Query parameters for solution history
 */
export class GetHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Number of history entries to return' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  public limit?: number;

  @ApiPropertyOptional({ description: 'Number of entries to skip' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  public offset?: number;
}

/**
 * DTO for comparing solutions
 * Used by: Solutions Compare View
 */
export class CompareSolutionsDto {
  @ApiProperty({ description: 'Solution IDs to compare (minimum 2)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  public solutionIds!: string[];

  @ApiPropertyOptional({ description: 'Aspects to compare (filter)', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public aspects?: string[];
}

/**
 * DTO for selecting a solution
 * Used by: Solutions Compare View "Select" button
 */
export class SelectSolutionDto {
  @ApiPropertyOptional({ description: 'Reason for selecting this solution' })
  @IsString()
  @IsOptional()
  public reason?: string;

  @ApiPropertyOptional({ description: 'Create an ADR Decision record for this selection' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return false;
  })
  @IsBoolean()
  @IsOptional()
  public createDecisionRecord?: boolean;
}
