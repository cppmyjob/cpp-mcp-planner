import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsIn,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const VALID_ARTIFACT_TYPES = ['code', 'config', 'migration', 'documentation', 'test', 'script', 'other'] as const;
const VALID_TARGET_ACTIONS = ['create', 'modify', 'delete'] as const;

class ArtifactTargetDto {
  @ApiProperty({ description: 'File path', example: 'src/services/auth.ts' })
  @IsString()
  @IsNotEmpty()
  public path!: string;

  @ApiProperty({ description: 'Action to perform', enum: VALID_TARGET_ACTIONS })
  @IsString()
  @IsIn(VALID_TARGET_ACTIONS)
  public action!: 'create' | 'modify' | 'delete';

  @ApiPropertyOptional({ description: 'Specific line number (1-indexed)', example: 42 })
  @IsOptional()
  public lineNumber?: number;

  @ApiPropertyOptional({ description: 'End line for range', example: 50 })
  @IsOptional()
  public lineEnd?: number;

  @ApiPropertyOptional({ description: 'Regex pattern to find location' })
  @IsString()
  @IsOptional()
  public searchPattern?: string;

  @ApiPropertyOptional({ description: 'Human-readable description' })
  @IsString()
  @IsOptional()
  public description?: string;
}

class ArtifactContentDto {
  @ApiPropertyOptional({ description: 'Programming language', example: 'typescript' })
  @IsString()
  @IsOptional()
  public language?: string;

  @ApiPropertyOptional({ description: 'Source code content' })
  @IsString()
  @IsOptional()
  public sourceCode?: string;

  @ApiPropertyOptional({ description: 'Suggested filename', example: 'auth-service.ts' })
  @IsString()
  @IsOptional()
  public filename?: string;
}

/**
 * DTO for creating/adding a new artifact
 */
export class AddArtifactDto {
  @ApiProperty({ description: 'Artifact title', example: 'Auth Service Implementation' })
  @IsString()
  @IsNotEmpty()
  public title!: string;

  @ApiProperty({ description: 'Artifact type', enum: VALID_ARTIFACT_TYPES })
  @IsString()
  @IsIn(VALID_ARTIFACT_TYPES)
  public artifactType!: 'code' | 'config' | 'migration' | 'documentation' | 'test' | 'script' | 'other';

  @ApiPropertyOptional({ description: 'Artifact description' })
  @IsString()
  @IsOptional()
  public description?: string;

  @ApiPropertyOptional({ description: 'URL-friendly slug (auto-generated if not provided)' })
  @IsString()
  @IsOptional()
  public slug?: string;

  @ApiPropertyOptional({ description: 'Artifact content', type: ArtifactContentDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ArtifactContentDto)
  @IsOptional()
  public content?: ArtifactContentDto;

  @ApiPropertyOptional({ description: 'File targets', type: [ArtifactTargetDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ArtifactTargetDto)
  @IsOptional()
  public targets?: ArtifactTargetDto[];

  @ApiPropertyOptional({ description: 'Related phase ID' })
  @IsString()
  @IsOptional()
  public relatedPhaseId?: string;

  @ApiPropertyOptional({ description: 'Related solution ID' })
  @IsString()
  @IsOptional()
  public relatedSolutionId?: string;

  @ApiPropertyOptional({ description: 'Related requirement IDs', type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public relatedRequirementIds?: string[];

  @ApiPropertyOptional({
    description: 'Code references in format "file_path:line_number"',
    type: [String],
    example: ['src/models/user.ts:10', 'src/db/schema.ts:5'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  public codeRefs?: string[];
}
