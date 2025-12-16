import {
  IsString,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for moving a phase (drag-drop in tree)
 * Used by: Phase Tree drag-drop
 */
export class MovePhaseDto {
  @ApiPropertyOptional({ description: 'New parent phase ID (null for root)', example: null })
  @IsString()
  @IsOptional()
  public newParentId?: string | null;

  @ApiPropertyOptional({ description: 'New order within siblings', minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  public newOrder?: number;
}
