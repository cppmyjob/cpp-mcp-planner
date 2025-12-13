import { z } from 'zod';

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const prioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
const categorySchema = z.enum(['functional', 'non-functional', 'technical', 'business']);
const sourceTypeSchema = z.enum(['user-request', 'discovered', 'derived']);

const requirementSourceSchema = z.object({
  type: sourceTypeSchema,
  context: z.string().optional(),
  parentId: z.string().optional(),
});

const requirementDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  rationale: z.string().optional(),
  source: requirementSourceSchema.optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
  priority: prioritySchema.optional(),
  category: categorySchema.optional(),
  tags: z.array(tagSchema).optional(),
});

const requirementFiltersSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
});

export const requirementSchema = z.object({
  action: z.enum(['add', 'get', 'get_many', 'update', 'list', 'delete', 'vote', 'unvote', 'get_history', 'diff', 'reset_all_votes']),
  planId: z.string(),
  requirementId: z.string().optional(),
  requirementIds: z.array(z.string()).optional(),
  requirement: requirementDataSchema.optional(),
  updates: z.record(z.string(), z.unknown()).optional(),
  filters: requirementFiltersSchema.optional(),
  includeTraceability: z.boolean().optional(),
  force: z.boolean().optional(),
  fields: z.array(z.string()).optional(),
  excludeMetadata: z.boolean().optional(),
});

export const requirementToolDescription = 'Manage project requirements - the foundation of planning workflow. Add requirements first, then propose solutions with `solution` tool to address them. Link requirements to phases for implementation tracking. Use `query` tool to trace requirement coverage. Use vote/unvote to prioritize requirements based on user feedback - each requirement has a votes field (default: 0) that can be incremented/decremented. Use reset_all_votes to reset all requirement votes to 0 in a plan. Actions: add, get, get_many, update, list, delete, vote, unvote, get_history, diff, reset_all_votes';
