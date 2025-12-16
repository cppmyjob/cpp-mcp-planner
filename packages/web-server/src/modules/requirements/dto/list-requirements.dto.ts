import { IsString, IsOptional, IsInt, Min, Max, IsIn, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import type {
  RequirementPriority,
  RequirementCategory,
  RequirementStatus,
} from '@mcp-planner/core';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const VALID_PRIORITIES: RequirementPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_CATEGORIES: RequirementCategory[] = ['functional', 'non-functional', 'technical', 'business'];
const VALID_STATUSES: RequirementStatus[] = ['draft', 'approved', 'implemented', 'deferred', 'rejected'];

/**
 * Query parameters for listing requirements
 * Used by: Kanban Board columns (filter by status)
 */
export class ListRequirementsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status (for Kanban columns)', enum: VALID_STATUSES })
  @IsString()
  @IsIn(VALID_STATUSES)
  @IsOptional()
  public status?: RequirementStatus;

  @ApiPropertyOptional({ description: 'Filter by priority', enum: VALID_PRIORITIES })
  @IsString()
  @IsIn(VALID_PRIORITIES)
  @IsOptional()
  public priority?: RequirementPriority;

  @ApiPropertyOptional({ description: 'Filter by category', enum: VALID_CATEGORIES })
  @IsString()
  @IsIn(VALID_CATEGORIES)
  @IsOptional()
  public category?: RequirementCategory;

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
}

/**
 * Query parameters for getting a single requirement
 */
export class GetRequirementQueryDto {
  @ApiPropertyOptional({ description: 'Include traceability information' })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return false;
  })
  @IsBoolean()
  @IsOptional()
  public includeTraceability?: boolean;

  @ApiPropertyOptional({ description: 'Fields to include (comma-separated or * for all)' })
  @IsOptional()
  @Transform(({ value }: { value: string }) => {
    if (typeof value === 'string') {
      return value.split(',').map((f: string) => f.trim());
    }
    return value;
  })
  public fields?: string[];
}

/**
 * Query parameters for requirement history
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
