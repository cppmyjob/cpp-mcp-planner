import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Query parameters for comparing two versions
 */
export class DiffQueryDto {
  @ApiProperty({ description: 'First version number', example: 1 })
  @Transform(({ value }: { value: string | number }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  public version1!: number;

  @ApiProperty({ description: 'Second version number', example: 2 })
  @Transform(({ value }: { value: string | number }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  public version2!: number;
}
