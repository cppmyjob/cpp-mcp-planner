import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsInt,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Query parameters for getting a single decision
 */
export class GetDecisionQueryDto {
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
}

/**
 * Query parameters for getting history
 */
export class GetHistoryQueryDto {
  @ApiPropertyOptional({ description: 'Page limit' })
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  public limit?: number;

  @ApiPropertyOptional({ description: 'Page offset' })
  @Transform(({ value }: { value: string }) => parseInt(value, 10))
  @IsOptional()
  public offset?: number;
}

/**
 * Query parameters for diff
 */
export class DiffQueryDto {
  @ApiPropertyOptional({ description: 'First version to compare' })
  @Transform(({ value }: { value: string | undefined }) =>
    value !== undefined ? parseInt(value, 10) : undefined
  )
  @IsInt()
  @IsOptional()
  public version1?: number;

  @ApiPropertyOptional({ description: 'Second version to compare' })
  @Transform(({ value }: { value: string | undefined }) =>
    value !== undefined ? parseInt(value, 10) : undefined
  )
  @IsInt()
  @IsOptional()
  public version2?: number;
}
