import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min, Max, IsBoolean, IsArray, IsString } from 'class-validator';
import { Type, Transform } from 'class-transformer';

const MAX_TRACE_DEPTH = 3;

export class TraceQueryDto {
  @ApiPropertyOptional({
    description: 'Trace depth (1=solutions only, 2=+phases, 3=+artifacts)',
    default: MAX_TRACE_DEPTH,
    minimum: 1,
    maximum: MAX_TRACE_DEPTH,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(MAX_TRACE_DEPTH)
  @Type(() => Number)
  public depth?: number;

  @ApiPropertyOptional({
    description: 'Include phases in trace',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  public includePhases?: boolean;

  @ApiPropertyOptional({
    description: 'Include artifacts in trace',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  public includeArtifacts?: boolean;

  @ApiPropertyOptional({
    description: 'Limit for results',
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  public limit?: number;

  @ApiPropertyOptional({
    description: 'Fields to include for requirement',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public fields?: string[];

  @ApiPropertyOptional({
    description: 'Fields to include for solutions',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public solutionFields?: string[];

  @ApiPropertyOptional({
    description: 'Fields to include for phases',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public phaseFields?: string[];

  @ApiPropertyOptional({
    description: 'Exclude metadata fields (createdAt, updatedAt, version)',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  public excludeMetadata?: boolean;
}
