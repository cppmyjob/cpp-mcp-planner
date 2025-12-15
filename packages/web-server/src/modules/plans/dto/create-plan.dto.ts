import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const MAX_HISTORY_DEPTH = 10;

export class CreatePlanDto {
  @ApiProperty({ description: 'Plan name', example: 'My Project Plan' })
  @IsString()
  @IsNotEmpty()
  public name!: string;

  @ApiProperty({ description: 'Plan description', example: 'A detailed plan for the project' })
  @IsString()
  public description!: string;

  @ApiPropertyOptional({ description: 'Plan author', example: 'claude-code' })
  @IsString()
  @IsOptional()
  public author?: string;

  @ApiPropertyOptional({ description: 'Enable version history tracking', default: false })
  @IsBoolean()
  @IsOptional()
  public enableHistory?: boolean;

  @ApiPropertyOptional({ description: 'Maximum versions to keep (0-10)', minimum: 0, maximum: 10 })
  @IsInt()
  @Min(0)
  @Max(MAX_HISTORY_DEPTH)
  @IsOptional()
  public maxHistoryDepth?: number;
}
