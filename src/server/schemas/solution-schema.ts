import { z } from 'zod';

const effortUnitSchema = z.enum(['minutes', 'hours', 'days', 'weeks', 'story-points']);
const confidenceSchema = z.enum(['low', 'medium', 'high']);
const feasibilitySchema = z.enum(['high', 'medium', 'low']);

const effortEstimateSchema = z.object({
  value: z.number(),
  unit: effortUnitSchema,
  confidence: confidenceSchema,
});

const tradeoffSchema = z.object({
  aspect: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  score: z.number().optional(),
});

const evaluationSchema = z.object({
  effortEstimate: effortEstimateSchema.optional(),
  technicalFeasibility: feasibilitySchema.optional(),
  riskAssessment: z.string().optional(),
});

const solutionDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  approach: z.string().optional(),
  implementationNotes: z.string().optional(),
  tradeoffs: z.array(tradeoffSchema).optional(),
  addressing: z.array(z.string()).optional(),
  evaluation: evaluationSchema.optional(),
});

export const solutionSchema = z.object({
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
});

export const solutionToolDescription = 'Manage solution proposals for requirements. Propose multiple solutions with tradeoff analysis, compare them to evaluate options, then select the best one. Use `decision` tool to record selection rationale. Selected solutions guide phase implementation. Actions: propose, get, get_many, update, list, compare, select, delete, get_history, diff.';
