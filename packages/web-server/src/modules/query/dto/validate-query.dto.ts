import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsArray, IsString, IsEnum } from 'class-validator';

export class ValidateQueryDto {
  @ApiPropertyOptional({
    description: 'Specific validation checks to perform',
    type: [String],
    example: ['uncovered-requirements', 'orphan-solutions', 'broken-links'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public checks?: string[];

  @ApiPropertyOptional({
    description: 'Validation level (basic=errors only, strict=all issues)',
    enum: ['basic', 'strict'],
    default: 'basic',
  })
  @IsOptional()
  @IsEnum(['basic', 'strict'])
  public validationLevel?: 'basic' | 'strict';
}
