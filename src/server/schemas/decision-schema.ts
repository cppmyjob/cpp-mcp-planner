import { z } from 'zod';

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const decisionStatusSchema = z.enum(['active', 'superseded', 'reversed']);

const alternativeSchema = z.object({
  option: z.string(),
  reasoning: z.string(),
  whyNotChosen: z.string().optional(),
});

const decisionDataSchema = z.object({
  title: z.string().optional(),
  question: z.string().optional(),
  context: z.string().optional(),
  decision: z.string().optional(),
  consequences: z.string().optional(),
  alternativesConsidered: z.array(alternativeSchema).optional(),
  impactScope: z.array(z.string()).optional(),
  tags: z.array(tagSchema).optional(),
});

const decisionUpdatesSchema = z.object({
  title: z.string().optional(),
  context: z.string().optional(),
  decision: z.string().optional(),
  consequences: z.string().optional(),
});

// Base schema with all fields
const baseDecisionSchema = z.object({
  action: z.enum(['record', 'get', 'get_many', 'update', 'list', 'supersede', 'get_history', 'diff']),
  planId: z.string(),
  decisionId: z.string().optional(),
  decisionIds: z.array(z.string()).optional(),
  decision: decisionDataSchema.optional(),
  updates: decisionUpdatesSchema.optional(),
  newDecision: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
  status: decisionStatusSchema.optional(),
  supersededBy: z.string().optional(),
  supersedes: z.string().optional(),
  fields: z.array(z.string()).optional(),
  excludeMetadata: z.boolean().optional(),
  // For diff action
  version1: z.number().optional(),
  version2: z.number().optional(),
});

// Type for the base schema
type DecisionInput = z.infer<typeof baseDecisionSchema>;

// Schema with superRefine for required field validation based on action
export const decisionSchema = baseDecisionSchema.superRefine((data: DecisionInput, ctx) => {
  switch (data.action) {
    case 'record':
      // decision object and decision.title, decision.question, decision.decision are required
      if (data.decision === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'decision object is required for record action',
          path: ['decision'],
        });
        return;
      }
      if (typeof data.decision.title !== 'string' || data.decision.title === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'decision.title is required for record action',
          path: ['decision', 'title'],
        });
      }
      if (typeof data.decision.question !== 'string' || data.decision.question === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'decision.question is required for record action',
          path: ['decision', 'question'],
        });
      }
      if (typeof data.decision.decision !== 'string' || data.decision.decision === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'decision.decision is required for record action',
          path: ['decision', 'decision'],
        });
      }
      break;

    case 'get':
    case 'update':
    case 'supersede':
    case 'get_history':
    case 'diff':
      // decisionId is required
      if (typeof data.decisionId !== 'string' || data.decisionId === '') {
        ctx.addIssue({
          code: 'custom',
          message: `decisionId is required for ${data.action} action`,
          path: ['decisionId'],
        });
      }
      break;

    case 'get_many':
      // decisionIds is required
      if (!Array.isArray(data.decisionIds) || data.decisionIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'decisionIds is required for get_many action',
          path: ['decisionIds'],
        });
      }
      break;

    case 'list':
      // Only planId is required (already validated by base schema)
      break;
  }
});

export const decisionToolDescription = 'Record architectural decisions (ADR pattern) with context and alternatives considered. Use after solution selection or for any significant technical choice. Decisions can be superseded when context changes, maintaining decision history. Link decisions to requirements/solutions for traceability. Actions: record, get, get_many, update, list, supersede, get_history, diff.';
