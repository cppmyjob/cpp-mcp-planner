import { IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Query parameters for getting version history
 */
export class HistoryQueryDto {
  @ApiPropertyOptional({ description: 'Maximum number of history entries to return', default: 10 })
  @Transform(({ value }: { value: string | number }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  public limit?: number;

  @ApiPropertyOptional({ description: 'Number of history entries to skip', default: 0 })
  @Transform(({ value }: { value: string | number }) => parseInt(String(value), 10))
  @IsInt()
  @Min(0)
  @IsOptional()
  public offset?: number;
}
