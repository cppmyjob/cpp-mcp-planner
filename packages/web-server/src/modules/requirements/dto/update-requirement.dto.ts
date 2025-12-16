import {
  IsString,
  IsOptional,
  IsArray,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import type {
  RequirementPriority,
  RequirementCategory,
  RequirementStatus,
} from '@mcp-planner/core';

const VALID_PRIORITIES: RequirementPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_CATEGORIES: RequirementCategory[] = ['functional', 'non-functional', 'technical', 'business'];
const VALID_STATUSES: RequirementStatus[] = ['draft', 'approved', 'implemented', 'deferred', 'rejected'];

/**
 * DTO for updating a requirement
 * Used by: Edit Dialog, Kanban drag-drop (status only)
 * All fields are optional for partial updates
 */
export class UpdateRequirementDto {
  @ApiPropertyOptional({ description: 'Requirement title' })
  @IsString()
  @IsOptional()
  public title?: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
  @IsString()
  @IsOptional()
  public description?: string;

  @ApiPropertyOptional({ description: 'Priority level', enum: VALID_PRIORITIES })
  @IsString()
  @IsIn(VALID_PRIORITIES)
  @IsOptional()
  public priority?: RequirementPriority;

  @ApiPropertyOptional({ description: 'Category', enum: VALID_CATEGORIES })
  @IsString()
  @IsIn(VALID_CATEGORIES)
  @IsOptional()
  public category?: RequirementCategory;

  @ApiPropertyOptional({ description: 'Status (for Kanban drag-drop)', enum: VALID_STATUSES })
  @IsString()
  @IsIn(VALID_STATUSES)
  @IsOptional()
  public status?: RequirementStatus;

  @ApiPropertyOptional({ description: 'Acceptance criteria list', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public acceptanceCriteria?: string[];

  @ApiPropertyOptional({ description: 'Rationale' })
  @IsString()
  @IsOptional()
  public rationale?: string;
}
