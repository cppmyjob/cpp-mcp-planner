import { z } from 'zod';

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const prioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
const categorySchema = z.enum(['functional', 'non-functional', 'technical', 'business']);
const sourceTypeSchema = z.enum(['user-request', 'discovered', 'derived']);

// Source schema with type required when source is provided
const requirementSourceSchema = z.object({
  type: sourceTypeSchema, // REQUIRED when source object is provided
  context: z.string().optional(),
  parentId: z.string().optional(),
});

const requirementStatusSchema = z.enum(['draft', 'approved', 'implemented', 'deferred', 'rejected']);
const riskLevelSchema = z.enum(['low', 'medium', 'high']);

const MAX_COMPLEXITY_ESTIMATE = 10;

const impactSchema = z.object({
  scope: z.array(z.string()),
  complexityEstimate: z.number().min(1).max(MAX_COMPLEXITY_ESTIMATE),
  riskLevel: riskLevelSchema,
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
  status: requirementStatusSchema.optional(),
  votes: z.number().optional(),
  impact: impactSchema.optional(),
});

const requirementFiltersSchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  category: z.string().optional(),
});

// Base schema with all fields
const baseRequirementSchema = z.object({
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
  // For diff action
  version1: z.number().optional(),
  version2: z.number().optional(),
});

// Type for the base schema
type RequirementInput = z.infer<typeof baseRequirementSchema>;

// Schema with superRefine for required field validation based on action
export const requirementSchema = baseRequirementSchema.superRefine((data: RequirementInput, ctx) => {
  switch (data.action) {
    case 'add':
      // requirement and requirement.title are required
      if (data.requirement === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'requirement object is required for add action',
          path: ['requirement'],
        });
        return;
      }
      if (typeof data.requirement.title !== 'string' || data.requirement.title === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'requirement.title is required for add action',
          path: ['requirement', 'title'],
        });
      }
      break;

    case 'get':
    case 'delete':
    case 'vote':
    case 'unvote':
    case 'get_history':
    case 'diff':
      // requirementId is required
      if (typeof data.requirementId !== 'string' || data.requirementId === '') {
        ctx.addIssue({
          code: 'custom',
          message: `requirementId is required for ${data.action} action`,
          path: ['requirementId'],
        });
      }
      break;

    case 'get_many':
      // requirementIds is required
      if (!Array.isArray(data.requirementIds) || data.requirementIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'requirementIds is required for get_many action',
          path: ['requirementIds'],
        });
      }
      break;

    case 'update':
      // requirementId and updates are required
      if (typeof data.requirementId !== 'string' || data.requirementId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'requirementId is required for update action',
          path: ['requirementId'],
        });
      }
      if (data.updates === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'updates object is required for update action',
          path: ['updates'],
        });
      }
      break;

    case 'list':
    case 'reset_all_votes':
      // Only planId is required (already validated by base schema)
      break;
  }
});

export const requirementToolDescription = 'Manage project requirements - the foundation of planning workflow. Add requirements first, then propose solutions with `solution` tool to address them. Link requirements to phases for implementation tracking. Use `query` tool to trace requirement coverage. Use vote/unvote to prioritize requirements based on user feedback - each requirement has a votes field (default: 0) that can be incremented/decremented. Use reset_all_votes to reset all requirement votes to 0 in a plan. Actions: add, get, get_many, update, list, delete, vote, unvote, get_history, diff, reset_all_votes';
