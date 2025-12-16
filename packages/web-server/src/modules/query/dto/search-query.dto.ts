import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsArray, IsNumber, Min, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class SearchQueryDto {
  @ApiProperty({ description: 'Search query string' })
  @IsString()
  @IsNotEmpty()
  public query!: string;

  @ApiPropertyOptional({
    description: 'Entity types to search (requirement, solution, decision, phase, artifact)',
    type: [String],
    example: ['requirement', 'solution'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public entityTypes?: string[];

  @ApiPropertyOptional({
    description: 'Filter by status',
    example: 'active',
  })
  @IsOptional()
  @IsString()
  public status?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of results',
    default: 50,
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  public limit?: number;

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  public offset?: number;

  @ApiPropertyOptional({
    description: 'Tags filter',
    type: 'object',
    additionalProperties: true,
    example: { key: 'priority', value: 'high' },
  })
  @IsOptional()
  @IsObject()
  public tags?: Record<string, string>;
}
