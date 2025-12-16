import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsEnum } from 'class-validator';

export class GetLinksQueryDto {
  @ApiPropertyOptional({ description: 'Entity ID to filter links' })
  @IsString()
  @IsOptional()
  public entityId?: string;

  @ApiPropertyOptional({
    description: 'Relation type filter',
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
  @IsOptional()
  public relationType?:
    | 'implements'
    | 'addresses'
    | 'depends_on'
    | 'blocks'
    | 'alternative_to'
    | 'supersedes'
    | 'references'
    | 'derived_from'
    | 'has_artifact';

  @ApiPropertyOptional({
    description: 'Direction of links to retrieve',
    enum: ['outgoing', 'incoming', 'both'],
    default: 'both',
  })
  @IsEnum(['outgoing', 'incoming', 'both'])
  @IsOptional()
  public direction?: 'outgoing' | 'incoming' | 'both';
}
