import type { Services } from '../services.js';
import { ToolError, type ToolResult } from './types.js';
import { handlePlan } from './plan-handler.js';
import { handleRequirement } from './requirement-handler.js';
import { handleSolution } from './solution-handler.js';
import { handleDecision } from './decision-handler.js';
import { handlePhase } from './phase-handler.js';
import { handleArtifact } from './artifact-handler.js';
import { handleLink } from './link-handler.js';
import { handleQuery } from './query-handler.js';
import { handleBatch } from './batch-handler.js';
// GREEN: Phase 4.14 - Import project handler
import { handleProject } from './project-handler.js';

// Re-export types and utilities
export { ToolError, createSuccessResponse, type ToolResult, type HandlerFn } from './types.js';

// Re-export individual handlers
export { handlePlan } from './plan-handler.js';
export { handleRequirement } from './requirement-handler.js';
export { handleSolution } from './solution-handler.js';
export { handleDecision } from './decision-handler.js';
export { handlePhase } from './phase-handler.js';
export { handleArtifact } from './artifact-handler.js';
export { handleLink } from './link-handler.js';
export { handleQuery } from './query-handler.js';
export { handleBatch } from './batch-handler.js';
// GREEN: Phase 4.14 - Export project handler
export { handleProject } from './project-handler.js';

// Unified handleToolCall for backward compatibility with tests
export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  services: Services
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'plan':
        return await handlePlan(args as { action: string; [key: string]: unknown }, services);
      case 'requirement':
        return await handleRequirement(args as { action: string; [key: string]: unknown }, services);
      case 'solution':
        return await handleSolution(args as { action: string; [key: string]: unknown }, services);
      case 'decision':
        return await handleDecision(args as { action: string; [key: string]: unknown }, services);
      case 'phase':
        return await handlePhase(args as { action: string; [key: string]: unknown }, services);
      case 'artifact':
        return await handleArtifact(args as { action: string; [key: string]: unknown }, services);
      case 'link':
        return await handleLink(args as { action: string; [key: string]: unknown }, services);
      case 'query':
        return await handleQuery(args as { action: string; [key: string]: unknown }, services);
      case 'batch':
        return await handleBatch(args as { planId: string; operations: unknown[] }, services);
      // GREEN: Phase 4.14 - Add project handler
      case 'project':
        return await handleProject(args as { action: string; [key: string]: unknown }, services);
      default:
        throw new ToolError('MethodNotFound', `Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof ToolError) {
      throw error;
    }
    // Handle various error types safely
    const message = error instanceof Error
      ? (error.message !== '' ? error.message : 'Error without message')
      : 'Unknown error';
    throw new ToolError('InternalError', message);
  }
}
