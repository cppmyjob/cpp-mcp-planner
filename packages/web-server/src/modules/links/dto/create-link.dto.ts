import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsObject } from 'class-validator';

export class CreateLinkDto {
  @ApiProperty({ description: 'Source entity ID' })
  @IsString()
  @IsNotEmpty()
  public sourceId!: string;

  @ApiProperty({ description: 'Target entity ID' })
  @IsString()
  @IsNotEmpty()
  public targetId!: string;

  @ApiProperty({
    description: 'Relation type',
    enum: [
      'implements',
      'addresses',
      'depends_on',
      'blocks',
      'alternative_to',
      'supersedes',
      'references',
      'derived_from',
      'has_artifact',
    ],
  })
  @IsEnum([
    'implements',
    'addresses',
    'depends_on',
    'blocks',
    'alternative_to',
    'supersedes',
    'references',
    'derived_from',
    'has_artifact',
  ])
  public relationType!:
    | 'implements'
    | 'addresses'
    | 'depends_on'
    | 'blocks'
    | 'alternative_to'
    | 'supersedes'
    | 'references'
    | 'derived_from'
    | 'has_artifact';

  @ApiPropertyOptional({ description: 'Additional metadata for the link' })
  @IsOptional()
  @IsObject()
  public metadata?: Record<string, unknown>;
}
