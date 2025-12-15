/**
 * Mock for @nestjs/swagger decorators in test environment
 * Prevents ESM/metadata issues during Jest testing
 */

/* eslint-disable @typescript-eslint/naming-convention */
// Decorator names must match @nestjs/swagger API (PascalCase)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DecoratorFunction = (...args: any[]) => PropertyDecorator & MethodDecorator & ClassDecorator;

const noopDecorator: DecoratorFunction = () => () => undefined;

export const ApiTags = noopDecorator;
export const ApiOperation = noopDecorator;
export const ApiResponse = noopDecorator;
export const ApiParam = noopDecorator;
export const ApiProperty = noopDecorator;
export const ApiPropertyOptional = noopDecorator;
export const ApiQuery = noopDecorator;
export const ApiBody = noopDecorator;
export const ApiHeader = noopDecorator;
export const ApiBearerAuth = noopDecorator;
export const ApiExcludeEndpoint = noopDecorator;
export const ApiExcludeController = noopDecorator;

// Re-export types (empty since we mock)
export type ApiPropertyOptions = Record<string, unknown>;
