import {
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Query parameters for listing multiple phases by IDs
 */
export class ListPhasesQueryDto {
  @ApiProperty({ description: 'Phase IDs to retrieve (comma-separated)', example: 'id1,id2,id3', required: true })
  @Transform(({ value }: { value: string | string[] }) =>
    typeof value === 'string' ? value.split(',').map((f) => f.trim()) : value
  )
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  public phaseIds!: string[];

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
