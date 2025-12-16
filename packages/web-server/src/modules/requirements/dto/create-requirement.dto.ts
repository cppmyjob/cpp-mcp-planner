import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type {
  RequirementPriority,
  RequirementCategory,
  RequirementStatus,
  RequirementSource,
} from '@mcp-planner/core';

const VALID_PRIORITIES: RequirementPriority[] = ['critical', 'high', 'medium', 'low'];
const VALID_CATEGORIES: RequirementCategory[] = ['functional', 'non-functional', 'technical', 'business'];
const VALID_STATUSES: RequirementStatus[] = ['draft', 'approved', 'implemented', 'deferred', 'rejected'];
const VALID_SOURCE_TYPES: RequirementSource[] = ['user-request', 'discovered', 'derived'];

/**
 * Source information for requirement origin
 */
export class RequirementSourceDto {
  @ApiProperty({ description: 'Source type', enum: VALID_SOURCE_TYPES })
  @IsString()
  @IsIn(VALID_SOURCE_TYPES)
  @IsNotEmpty()
  public type!: RequirementSource;

  @ApiPropertyOptional({ description: 'Additional context about the source' })
  @IsString()
  @IsOptional()
  public context?: string;

  @ApiPropertyOptional({ description: 'Parent requirement ID if derived' })
  @IsString()
  @IsOptional()
  public parentId?: string;
}

/**
 * DTO for creating a new requirement
 * Used by: Add Dialog in Kanban Board
 */
export class CreateRequirementDto {
  @ApiProperty({ description: 'Requirement title', example: 'User Authentication' })
  @IsString()
  @IsNotEmpty()
  public title!: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
  @IsString()
  @IsOptional()
  public description?: string;

  @ApiProperty({ description: 'Requirement source information' })
  @ValidateNested()
  @Type(() => RequirementSourceDto)
  @IsObject()
  public source!: RequirementSourceDto;

  @ApiPropertyOptional({ description: 'Priority level', enum: VALID_PRIORITIES, default: 'medium' })
  @IsString()
  @IsIn(VALID_PRIORITIES)
  @IsOptional()
  public priority?: RequirementPriority;

  @ApiPropertyOptional({ description: 'Category', enum: VALID_CATEGORIES, default: 'functional' })
  @IsString()
  @IsIn(VALID_CATEGORIES)
  @IsOptional()
  public category?: RequirementCategory;

  @ApiPropertyOptional({ description: 'Initial status', enum: VALID_STATUSES, default: 'draft' })
  @IsString()
  @IsIn(VALID_STATUSES)
  @IsOptional()
  public status?: RequirementStatus;

  @ApiPropertyOptional({ description: 'Acceptance criteria list', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public acceptanceCriteria?: string[];

  @ApiPropertyOptional({ description: 'Rationale for this requirement' })
  @IsString()
  @IsOptional()
  public rationale?: string;
}
