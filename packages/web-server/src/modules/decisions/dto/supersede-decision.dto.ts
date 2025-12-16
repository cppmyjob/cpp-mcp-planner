import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * New decision content for superseding
 */
export class NewDecisionContentDto {
  @ApiProperty({ description: 'The new decision text', example: 'We will use MongoDB instead' })
  @IsString()
  @IsNotEmpty()
  public decision!: string;

  @ApiPropertyOptional({ description: 'Updated context' })
  @IsString()
  @IsOptional()
  public context?: string;

  @ApiPropertyOptional({ description: 'Updated consequences' })
  @IsString()
  @IsOptional()
  public consequences?: string;
}

/**
 * DTO for superseding a decision
 * Used by: Timeline "supersede" action
 */
export class SupersedeDecisionDto {
  @ApiProperty({ description: 'New decision content', type: NewDecisionContentDto })
  @ValidateNested()
  @Type(() => NewDecisionContentDto)
  public newDecision!: NewDecisionContentDto;

  @ApiProperty({ description: 'Reason for superseding', example: 'Requirements changed' })
  @IsString()
  @IsNotEmpty()
  public reason!: string;
}
