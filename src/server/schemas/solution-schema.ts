import { z } from 'zod';

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const effortUnitSchema = z.enum(['minutes', 'hours', 'days', 'weeks', 'story-points']);
const confidenceSchema = z.enum(['low', 'medium', 'high']);
const feasibilitySchema = z.enum(['high', 'medium', 'low']);
const solutionStatusSchema = z.enum(['proposed', 'evaluated', 'selected', 'rejected', 'implemented']);

const MAX_TRADEOFF_SCORE = 10;

const effortEstimateSchema = z.object({
  value: z.number(),
  unit: effortUnitSchema,
  confidence: confidenceSchema,
});

const tradeoffSchema = z.object({
  aspect: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  score: z.number().min(1).max(MAX_TRADEOFF_SCORE).optional(),
});

const evaluationSchema = z.object({
  effortEstimate: effortEstimateSchema.optional(),
  technicalFeasibility: feasibilitySchema.optional(),
  riskAssessment: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  performanceImpact: z.string().optional(),
});

const solutionDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  approach: z.string().optional(),
  implementationNotes: z.string().optional(),
  tradeoffs: z.array(tradeoffSchema).optional(),
  addressing: z.array(z.string()).optional(),
  evaluation: evaluationSchema.optional(),
  status: solutionStatusSchema.optional(),
  selectionReason: z.string().optional(),
  tags: z.array(tagSchema).optional(),
});

// Base schema with all fields
const baseSolutionSchema = z.object({
  action: z.enum(['propose', 'get', 'get_many', 'update', 'list', 'compare', 'select', 'delete', 'get_history', 'diff']),
  planId: z.string(),
  solutionId: z.string().optional(),
  solutionIds: z.array(z.string()).optional(),
  solution: solutionDataSchema.optional(),
  updates: z.record(z.string(), z.unknown()).optional(),
  aspects: z.array(z.string()).optional(),
  reason: z.string().optional(),
  createDecisionRecord: z.boolean().optional(),
  fields: z.array(z.string()).optional(),
  excludeMetadata: z.boolean().optional(),
  // For diff action
  version1: z.number().optional(),
  version2: z.number().optional(),
});

// Type for the base schema
type SolutionInput = z.infer<typeof baseSolutionSchema>;

// Schema with superRefine for required field validation based on action
export const solutionSchema = baseSolutionSchema.superRefine((data: SolutionInput, ctx) => {
  switch (data.action) {
    case 'propose':
      // solution and solution.title are required
      if (data.solution === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'solution object is required for propose action',
          path: ['solution'],
        });
        return;
      }
      if (typeof data.solution.title !== 'string' || data.solution.title === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'solution.title is required for propose action',
          path: ['solution', 'title'],
        });
      }
      break;

    case 'get':
    case 'delete':
    case 'select':
    case 'get_history':
    case 'diff':
      // solutionId is required
      if (typeof data.solutionId !== 'string' || data.solutionId === '') {
        ctx.addIssue({
          code: 'custom',
          message: `solutionId is required for ${data.action} action`,
          path: ['solutionId'],
        });
      }
      break;

    case 'get_many':
    case 'compare':
      // solutionIds is required
      if (!Array.isArray(data.solutionIds) || data.solutionIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: `solutionIds is required for ${data.action} action`,
          path: ['solutionIds'],
        });
      }
      break;

    case 'update':
      // solutionId and updates are required
      if (typeof data.solutionId !== 'string' || data.solutionId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'solutionId is required for update action',
          path: ['solutionId'],
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
      // Only planId is required (already validated by base schema)
      break;
  }
});

export const solutionToolDescription = 'Manage solution proposals for requirements. Propose multiple solutions with tradeoff analysis, compare them to evaluate options, then select the best one. Use `decision` tool to record selection rationale. Selected solutions guide phase implementation. Actions: propose, get, get_many, update, list, compare, select, delete, get_history, diff.';
