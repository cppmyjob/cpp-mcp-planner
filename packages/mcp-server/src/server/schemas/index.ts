import { z } from 'zod';

// Export schemas
export { planSchema, planToolDescription } from './plan-schema.js';
export { requirementSchema, requirementToolDescription } from './requirement-schema.js';
export { solutionSchema, solutionToolDescription } from './solution-schema.js';
export { decisionSchema, decisionToolDescription } from './decision-schema.js';
export { phaseSchema, phaseToolDescription } from './phase-schema.js';
export { artifactSchema, artifactToolDescription } from './artifact-schema.js';
export { linkSchema, linkToolDescription } from './link-schema.js';
export { querySchema, queryToolDescription } from './query-schema.js';
export { batchSchema, batchToolDescription } from './batch-schema.js';
// GREEN: Phase 4.14 - Export project schema
export { projectSchema, projectToolDescription } from './project-schema.js';

// Import for tools array generation
import { planSchema, planToolDescription } from './plan-schema.js';
import { requirementSchema, requirementToolDescription } from './requirement-schema.js';
import { solutionSchema, solutionToolDescription } from './solution-schema.js';
import { decisionSchema, decisionToolDescription } from './decision-schema.js';
import { phaseSchema, phaseToolDescription } from './phase-schema.js';
import { artifactSchema, artifactToolDescription } from './artifact-schema.js';
import { linkSchema, linkToolDescription } from './link-schema.js';
import { querySchema, queryToolDescription } from './query-schema.js';
import { batchSchema, batchToolDescription } from './batch-schema.js';
import { projectSchema, projectToolDescription } from './project-schema.js';

// Tool definition type for backward compatibility
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Generate tools array from Zod schemas using Zod 4's built-in toJSONSchema
export const tools: ToolDefinition[] = [
  {
    name: 'plan',
    description: planToolDescription,
    inputSchema: z.toJSONSchema(planSchema) as Record<string, unknown>,
  },
  {
    name: 'requirement',
    description: requirementToolDescription,
    inputSchema: z.toJSONSchema(requirementSchema) as Record<string, unknown>,
  },
  {
    name: 'solution',
    description: solutionToolDescription,
    inputSchema: z.toJSONSchema(solutionSchema) as Record<string, unknown>,
  },
  {
    name: 'decision',
    description: decisionToolDescription,
    inputSchema: z.toJSONSchema(decisionSchema) as Record<string, unknown>,
  },
  {
    name: 'phase',
    description: phaseToolDescription,
    inputSchema: z.toJSONSchema(phaseSchema) as Record<string, unknown>,
  },
  {
    name: 'artifact',
    description: artifactToolDescription,
    inputSchema: z.toJSONSchema(artifactSchema) as Record<string, unknown>,
  },
  {
    name: 'link',
    description: linkToolDescription,
    inputSchema: z.toJSONSchema(linkSchema) as Record<string, unknown>,
  },
  {
    name: 'query',
    description: queryToolDescription,
    inputSchema: z.toJSONSchema(querySchema) as Record<string, unknown>,
  },
  {
    name: 'batch',
    description: batchToolDescription,
    inputSchema: z.toJSONSchema(batchSchema) as Record<string, unknown>,
  },
  // GREEN: Phase 4.14 - Add project tool
  {
    name: 'project',
    description: projectToolDescription,
    inputSchema: z.toJSONSchema(projectSchema) as Record<string, unknown>,
  },
];
