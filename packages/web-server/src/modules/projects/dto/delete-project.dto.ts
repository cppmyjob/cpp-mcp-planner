import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Query DTO for deleting project config
 */
export class DeleteProjectQueryDto {
  @ApiProperty({
    description: 'Absolute path to project workspace',
    example: '/home/user/projects/my-project',
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  public workspacePath!: string;
}
