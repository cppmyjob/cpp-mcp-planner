import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class DeletePlanQueryDto {
  @ApiPropertyOptional({ description: 'Permanently delete instead of archiving', default: false })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  public permanent?: boolean;
}
