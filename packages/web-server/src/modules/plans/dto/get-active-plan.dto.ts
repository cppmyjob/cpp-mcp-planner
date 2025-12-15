import { IsString, IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class GetActivePlanQueryDto {
  @ApiPropertyOptional({ description: 'Workspace path to get active plan for' })
  @IsString()
  @IsOptional()
  public workspacePath?: string;

  @ApiPropertyOptional({ description: 'Include usage guide in response', default: false })
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  public includeGuide?: boolean;
}
