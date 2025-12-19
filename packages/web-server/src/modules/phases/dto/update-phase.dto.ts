import { PartialType } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, Min, Max, IsOptional, IsString, ValidateIf } from 'class-validator';
import { AddPhaseDto } from './add-phase.dto.js';

/**
 * DTO for updating an existing phase
 * Uses PartialType to make all fields optional
 * Adds progress and blockingReason fields for phase updates
 */
export class UpdatePhaseDto extends PartialType(AddPhaseDto) {
  @ApiPropertyOptional({ description: 'Phase progress percentage (0-100)', minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  public progress?: number;

  @ApiPropertyOptional({ description: 'Reason for blocked status (empty string to clear)' })
  @ValidateIf((o: UpdatePhaseDto) => o.blockingReason !== '')
  @IsString()
  @IsOptional()
  public blockingReason?: string;
}
