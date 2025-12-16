import {
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsArray,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';

/**
 * Query parameters for getting phase tree
 */
export class TreeQueryDto {
  @ApiPropertyOptional({ description: 'Maximum tree depth (0 = root only)', minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  public maxDepth?: number;

  @ApiPropertyOptional({ description: 'Include completed phases', default: false })
  @Transform(({ value }: { value: string | boolean }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  public includeCompleted?: boolean;

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
