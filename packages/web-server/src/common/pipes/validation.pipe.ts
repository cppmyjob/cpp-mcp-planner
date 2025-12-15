import { ValidationPipe as NestValidationPipe, BadRequestException } from '@nestjs/common';
import { type ValidationError as ClassValidatorError } from 'class-validator';

interface FormattedError {
  field: string;
  message: string;
  constraints: string[];
}

/**
 * Custom validation pipe configuration with:
 * - whitelist: removes unknown properties
 * - forbidNonWhitelisted: throws error for unknown properties
 * - transform: auto-transforms payloads to DTO instances
 */
export function createValidationPipe(): NestValidationPipe {
  return new NestValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
    },
    exceptionFactory: (errors: ClassValidatorError[]) => {
      const formattedErrors = formatValidationErrors(errors);
      return new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors: formattedErrors,
      });
    },
  });
}

function formatValidationErrors(errors: ClassValidatorError[]): FormattedError[] {
  const result: FormattedError[] = [];

  for (const error of errors) {
    if (error.constraints) {
      result.push({
        field: error.property,
        message: Object.values(error.constraints).join(', '),
        constraints: Object.keys(error.constraints),
      });
    }

    // Handle nested validation errors
    if (error.children && error.children.length > 0) {
      const nestedErrors = formatValidationErrors(error.children);
      for (const nestedError of nestedErrors) {
        result.push({
          field: `${error.property}.${nestedError.field}`,
          message: nestedError.message,
          constraints: nestedError.constraints,
        });
      }
    }
  }

  return result;
}
