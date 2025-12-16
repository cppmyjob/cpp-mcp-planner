import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import type { EffortEstimate } from '@mcp-planner/core';

type EffortUnit = EffortEstimate['unit'];
type EffortConfidence = EffortEstimate['confidence'];
type TechnicalFeasibility = 'high' | 'medium' | 'low';

const VALID_UNITS: EffortUnit[] = ['minutes', 'hours', 'days', 'weeks', 'story-points'];
const VALID_CONFIDENCE: EffortConfidence[] = ['low', 'medium', 'high'];
const VALID_FEASIBILITY: TechnicalFeasibility[] = ['high', 'medium', 'low'];

// Validation constants
const MAX_TRADEOFF_SCORE = 10;

/**
 * Tradeoff aspect for solution evaluation
 */
export class TradeoffDto {
  @ApiProperty({ description: 'Aspect being evaluated', example: 'Performance' })
  @IsString()
  @IsNotEmpty()
  public aspect!: string;

  @ApiProperty({ description: 'Positive aspects', type: [String] })
  @IsArray()
  @IsString({ each: true })
  public pros!: string[];

  @ApiProperty({ description: 'Negative aspects', type: [String] })
  @IsArray()
  @IsString({ each: true })
  public cons!: string[];

  @ApiPropertyOptional({ description: 'Score for this aspect (0-10)', minimum: 0, maximum: MAX_TRADEOFF_SCORE })
  @IsNumber()
  @Min(0)
  @Max(MAX_TRADEOFF_SCORE)
  @IsOptional()
  public score?: number;
}

/**
 * Effort estimate for solution evaluation
 */
export class EffortEstimateDto {
  @ApiProperty({ description: 'Numeric value', example: 5 })
  @IsNumber()
  @Min(0)
  public value!: number;

  @ApiProperty({ description: 'Unit of measurement', enum: VALID_UNITS })
  @IsString()
  @IsIn(VALID_UNITS)
  public unit!: EffortUnit;

  @ApiProperty({ description: 'Confidence level', enum: VALID_CONFIDENCE })
  @IsString()
  @IsIn(VALID_CONFIDENCE)
  public confidence!: EffortConfidence;
}

/**
 * Evaluation metrics for solution
 */
export class EvaluationDto {
  @ApiProperty({ description: 'Effort estimate' })
  @ValidateNested()
  @Type(() => EffortEstimateDto)
  public effortEstimate!: EffortEstimateDto;

  @ApiProperty({ description: 'Technical feasibility', enum: VALID_FEASIBILITY })
  @IsString()
  @IsIn(VALID_FEASIBILITY)
  public technicalFeasibility!: TechnicalFeasibility;

  @ApiProperty({ description: 'Risk assessment' })
  @IsString()
  public riskAssessment!: string;
}

/**
 * DTO for creating/proposing a new solution
 * Used by: Propose Dialog in Solutions View
 */
export class CreateSolutionDto {
  @ApiProperty({ description: 'Solution title', example: 'Microservices Architecture' })
  @IsString()
  @IsNotEmpty()
  public title!: string;

  @ApiPropertyOptional({ description: 'Detailed description' })
  @IsString()
  @IsOptional()
  public description?: string;

  @ApiPropertyOptional({ description: 'Implementation approach' })
  @IsString()
  @IsOptional()
  public approach?: string;

  @ApiPropertyOptional({ description: 'Implementation notes' })
  @IsString()
  @IsOptional()
  public implementationNotes?: string;

  @ApiPropertyOptional({ description: 'Requirement IDs this solution addresses', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public addressing?: string[];

  @ApiPropertyOptional({ description: 'Tradeoff analysis', type: [TradeoffDto] })
  @ValidateNested({ each: true })
  @Type(() => TradeoffDto)
  @IsArray()
  @IsOptional()
  public tradeoffs?: TradeoffDto[];

  @ApiPropertyOptional({ description: 'Solution evaluation metrics' })
  @ValidateNested()
  @Type(() => EvaluationDto)
  @IsOptional()
  public evaluation?: EvaluationDto;
}
