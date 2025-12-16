import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Alternative considered for a decision
 */
export class AlternativeConsideredDto {
  @ApiProperty({ description: 'Alternative option name', example: 'GraphQL' })
  @IsString()
  @IsNotEmpty()
  public option!: string;

  @ApiProperty({ description: 'Reasoning for considering this option', example: 'Flexible queries, single endpoint' })
  @IsString()
  @IsNotEmpty()
  public reasoning!: string;

  @ApiPropertyOptional({ description: 'Why this option was not chosen', example: 'Steeper learning curve' })
  @IsString()
  @IsOptional()
  public whyNotChosen?: string;
}

/**
 * DTO for creating/recording a new decision
 * Used by: Record Decision Dialog in Decisions Timeline
 */
export class CreateDecisionDto {
  @ApiProperty({ description: 'Decision title', example: 'Use PostgreSQL for persistence' })
  @IsString()
  @IsNotEmpty()
  public title!: string;

  @ApiProperty({ description: 'Question being answered', example: 'Which database should we use?' })
  @IsString()
  @IsNotEmpty()
  public question!: string;

  @ApiProperty({ description: 'The decision made', example: 'We will use PostgreSQL for reliability' })
  @IsString()
  @IsNotEmpty()
  public decision!: string;

  @ApiPropertyOptional({ description: 'Context for the decision' })
  @IsString()
  @IsOptional()
  public context?: string;

  @ApiPropertyOptional({ description: 'Consequences of the decision' })
  @IsString()
  @IsOptional()
  public consequences?: string;

  @ApiPropertyOptional({ description: 'Alternatives that were considered', type: [AlternativeConsideredDto] })
  @ValidateNested({ each: true })
  @Type(() => AlternativeConsideredDto)
  @IsArray()
  @IsOptional()
  public alternativesConsidered?: AlternativeConsideredDto[];
}
