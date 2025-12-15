import { IsString, IsOptional, IsBoolean, IsInt, Min, Max, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type { PlanStatus } from '@mcp-planner/core';

const MAX_HISTORY_DEPTH = 10;
const VALID_STATUSES: PlanStatus[] = ['active', 'completed', 'archived'];

export class UpdatePlanDto {
  @ApiPropertyOptional({ description: 'Plan name' })
  @IsString()
  @IsOptional()
  public name?: string;

  @ApiPropertyOptional({ description: 'Plan description' })
  @IsString()
  @IsOptional()
  public description?: string;

  @ApiPropertyOptional({ description: 'Plan status', enum: VALID_STATUSES })
  @IsString()
  @IsIn(VALID_STATUSES)
  @IsOptional()
  public status?: PlanStatus;

  @ApiPropertyOptional({ description: 'Enable version history tracking' })
  @IsBoolean()
  @IsOptional()
  public enableHistory?: boolean;

  @ApiPropertyOptional({ description: 'Maximum versions to keep (0-10)' })
  @IsInt()
  @Min(0)
  @Max(MAX_HISTORY_DEPTH)
  @IsOptional()
  public maxHistoryDepth?: number;
}
