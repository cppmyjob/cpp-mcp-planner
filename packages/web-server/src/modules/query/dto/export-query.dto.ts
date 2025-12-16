import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsArray, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class ExportQueryDto {
  @ApiProperty({
    description: 'Export format',
    enum: ['markdown', 'json'],
    example: 'markdown',
  })
  @IsEnum(['markdown', 'json'])
  public format!: 'markdown' | 'json';

  @ApiPropertyOptional({
    description: 'Sections to include in export',
    type: [String],
    example: ['requirements', 'solutions', 'decisions', 'phases'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public sections?: string[];

  @ApiPropertyOptional({
    description: 'Include version history in export',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  public includeVersionHistory?: boolean;
}
