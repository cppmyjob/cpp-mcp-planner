import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsEnum,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Query parameters for listing phases
 * Supports two modes:
 * 1. By IDs: phaseIds (comma-separated)
 * 2. By filters: status, parentId
 */
export class ListPhasesQueryDto {
  @ApiPropertyOptional({ description: 'Phase IDs to retrieve (comma-separated)', example: 'id1,id2,id3' })
  @Transform(({ value }: { value: string | string[] }) =>
    typeof value === 'string' ? value.split(',').map((f) => f.trim()) : value
  )
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public phaseIds?: string[];

  @ApiPropertyOptional({
    description: 'Filter by phase status',
    enum: ['planned', 'in_progress', 'completed', 'blocked', 'skipped']
  })
  @IsEnum(['planned', 'in_progress', 'completed', 'blocked', 'skipped'])
  @IsOptional()
  public status?: 'planned' | 'in_progress' | 'completed' | 'blocked' | 'skipped';

  @ApiPropertyOptional({ description: 'Filter by parent phase ID' })
  @IsString()
  @IsOptional()
  public parentId?: string;

  @ApiPropertyOptional({ description: 'Fields to include (comma-separated)', type: [String] })
  @Transform(({ value }: { value: string | string[] }) =>
    typeof value === 'string' ? value.split(',').map((f) => f.trim()) : value
  )
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public fields?: string[];

  @ApiPropertyOptional({ description: 'Exclude metadata fields' })
  @Transform(({ value }: { value: string | boolean }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  public excludeMetadata?: boolean;

  @ApiPropertyOptional({ description: 'Exclude computed fields (depth, path, childCount)' })
  @Transform(({ value }: { value: string | boolean }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  public excludeComputed?: boolean;
}
