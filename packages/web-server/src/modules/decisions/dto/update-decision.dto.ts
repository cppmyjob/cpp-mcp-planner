import { PartialType } from '@nestjs/swagger';
import { CreateDecisionDto } from './create-decision.dto.js';

/**
 * DTO for updating an existing decision
 * Uses PartialType to make all fields optional
 */
export class UpdateDecisionDto extends PartialType(CreateDecisionDto) {}
