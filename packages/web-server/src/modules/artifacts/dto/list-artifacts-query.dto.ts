import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

const VALID_ARTIFACT_TYPES = ['code', 'config', 'migration', 'documentation', 'test', 'script', 'other'] as const;
const VALID_ARTIFACT_STATUS = ['draft', 'reviewed', 'approved', 'implemented', 'outdated'] as const;

/**
 * Query parameters for listing artifacts with filters
 */
export class ListArtifactsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by artifact type', enum: VALID_ARTIFACT_TYPES })
  @IsString()
  @IsIn(VALID_ARTIFACT_TYPES)
  @IsOptional()
  public artifactType?: string;

  @ApiPropertyOptional({ description: 'Filter by artifact status', enum: VALID_ARTIFACT_STATUS })
  @IsString()
  @IsIn(VALID_ARTIFACT_STATUS)
  @IsOptional()
  public status?: string;

  @ApiPropertyOptional({ description: 'Filter by related phase ID' })
  @IsString()
  @IsOptional()
  public relatedPhaseId?: string;

  @ApiPropertyOptional({ description: 'Maximum number of artifacts to return', default: 50 })
  @Transform(({ value }: { value: string | number }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @IsOptional()
  public limit?: number;

  @ApiPropertyOptional({ description: 'Number of artifacts to skip', default: 0 })
  @Transform(({ value }: { value: string | number }) => parseInt(String(value), 10))
  @IsInt()
  @Min(0)
  @IsOptional()
  public offset?: number;

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
