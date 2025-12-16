import { PartialType, OmitType } from '@nestjs/swagger';
import { AddArtifactDto } from './add-artifact.dto.js';
import { IsString, IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const VALID_ARTIFACT_STATUS = ['draft', 'reviewed', 'approved', 'implemented', 'outdated'] as const;

/**
 * DTO for updating an existing artifact
 * Omits artifactType (cannot be changed after creation)
 */
export class UpdateArtifactDto extends PartialType(OmitType(AddArtifactDto, ['artifactType'] as const)) {
  @ApiPropertyOptional({ description: 'Artifact status', enum: VALID_ARTIFACT_STATUS })
  @IsString()
  @IsIn(VALID_ARTIFACT_STATUS)
  @IsOptional()
  public status?: 'draft' | 'reviewed' | 'approved' | 'implemented' | 'outdated';
}
