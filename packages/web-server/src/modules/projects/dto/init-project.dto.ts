import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

/** Maximum length for projectId */
const MAX_PROJECT_ID_LENGTH = 50;

/**
 * DTO for initializing a new project
 */
export class InitProjectDto {
  @ApiProperty({
    description: 'Unique project identifier (alphanumeric, dots, dashes, underscores)',
    example: 'my-project',
    maxLength: MAX_PROJECT_ID_LENGTH,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROJECT_ID_LENGTH)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/, {
    message: 'projectId must start with alphanumeric and contain only letters, numbers, dots, dashes, underscores',
  })
  public projectId!: string;

  @ApiProperty({
    description: 'Absolute path to project workspace',
    example: '/home/user/projects/my-project',
  })
  @IsString()
  @IsNotEmpty()
  public workspacePath!: string;
}
