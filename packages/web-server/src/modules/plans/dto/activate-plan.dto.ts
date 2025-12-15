import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ActivatePlanDto {
  @ApiPropertyOptional({ description: 'Workspace path to associate with this plan' })
  @IsString()
  @IsOptional()
  public workspacePath?: string;
}
