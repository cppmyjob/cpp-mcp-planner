import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const VALID_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
type PhasePriority = typeof VALID_PRIORITIES[number];

/**
 * DTO for creating/adding a new phase
 * Used by: Add Phase dialog in Phase Tree
 */
export class AddPhaseDto {
  @ApiProperty({ description: 'Phase title', example: 'Backend Development' })
  @IsString()
  @IsNotEmpty()
  public title!: string;

  @ApiPropertyOptional({ description: 'Phase description' })
  @IsString()
  @IsOptional()
  public description?: string;

  @ApiPropertyOptional({ description: 'Phase objectives', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public objectives?: string[];

  @ApiPropertyOptional({ description: 'Phase deliverables', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public deliverables?: string[];

  @ApiPropertyOptional({ description: 'Success criteria', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public successCriteria?: string[];

  @ApiPropertyOptional({ description: 'Parent phase ID (null for root)', example: null })
  @IsString()
  @IsOptional()
  public parentId?: string | null;

  @ApiPropertyOptional({ description: 'Phase priority', enum: VALID_PRIORITIES, default: 'medium' })
  @IsString()
  @IsIn(VALID_PRIORITIES)
  @IsOptional()
  public priority?: PhasePriority;

  @ApiPropertyOptional({ description: 'Implementation notes' })
  @IsString()
  @IsOptional()
  public implementationNotes?: string;
}
