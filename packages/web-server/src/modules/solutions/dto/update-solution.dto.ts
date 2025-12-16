import { PartialType } from '@nestjs/swagger';
import { CreateSolutionDto } from './create-solution.dto.js';

/**
 * DTO for updating a solution
 * All fields are optional (partial update)
 * Used by: Edit Dialog, status updates
 */
export class UpdateSolutionDto extends PartialType(CreateSolutionDto) {}
