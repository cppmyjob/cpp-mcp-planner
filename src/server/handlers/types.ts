import type { Services } from '../services.js';

export class ToolError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface ToolResult {
  [key: string]: unknown;
  content: [{ type: 'text'; text: string }];
}

export type HandlerFn<T> = (args: T, services: Services) => Promise<ToolResult>;

export function createSuccessResponse(result: unknown): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
