import { IsString, IsOptional, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { PlanStatus } from '@mcp-planner/core';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const VALID_STATUSES: PlanStatus[] = ['active', 'completed', 'archived'];
const VALID_SORT_BY = ['created_at', 'updated_at', 'name'] as const;
const VALID_SORT_ORDER = ['asc', 'desc'] as const;

export class ListPlansQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status', enum: VALID_STATUSES })
  @IsString()
  @IsIn(VALID_STATUSES)
  @IsOptional()
  public status?: PlanStatus;

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

  @ApiPropertyOptional({ description: 'Sort field', enum: VALID_SORT_BY })
  @IsString()
  @IsIn(VALID_SORT_BY)
  @IsOptional()
  public sortBy?: 'created_at' | 'updated_at' | 'name';

  @ApiPropertyOptional({ description: 'Sort order', enum: VALID_SORT_ORDER })
  @IsString()
  @IsIn(VALID_SORT_ORDER)
  @IsOptional()
  public sortOrder?: 'asc' | 'desc';
}
