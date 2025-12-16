import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsIn,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const VALID_STATUSES = ['planned', 'in_progress', 'completed', 'blocked', 'skipped'] as const;
type PhaseStatus = typeof VALID_STATUSES[number];

/**
 * DTO for updating phase status and progress
 * Used by: Phase Tree status updates, Dashboard progress tracking
 */
export class UpdateStatusDto {
  @ApiProperty({ description: 'Phase status', enum: VALID_STATUSES })
  @IsString()
  @IsNotEmpty()
  @IsIn(VALID_STATUSES)
  public status!: PhaseStatus;

  @ApiPropertyOptional({ description: 'Phase progress percentage (0-100)', minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  public progress?: number;

  @ApiPropertyOptional({ description: 'Actual effort spent (hours)' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  public actualEffort?: number;

  @ApiPropertyOptional({ description: 'Notes about status update' })
  @IsString()
  @IsOptional()
  public notes?: string;
}
