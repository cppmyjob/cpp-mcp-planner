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

const supersedeSchema = z.object({
  newDecision: z.string(),
  reason: z.string(),
});

// REFACTOR: Structured schema for newDecision in supersede action
const newDecisionSchema = z.object({
  decision: z.string().optional(),
  context: z.string().optional(),
  consequences: z.string().optional(),
});

// Base schema with all fields
const baseDecisionSchema = z.object({
  action: z.enum(['record', 'get', 'get_many', 'update', 'list', 'supersede', 'get_history', 'diff', 'list_fields']),
  planId: z.string(),
  decisionId: z.string().optional(),
  decisionIds: z.array(z.string()).optional(),
  decision: decisionDataSchema.optional(),
  updates: decisionUpdatesSchema.optional(),
  supersede: supersedeSchema.optional(), // For update action with supersede option
  newDecision: newDecisionSchema.optional(), // REFACTOR: Structured schema for supersede action
  reason: z.string().optional(),
  status: decisionStatusSchema.optional(),
  // REFACTOR: Removed supersededBy and supersedes - they are entity output fields, not MCP input parameters
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
  // H-2 FIX: status parameter is only valid for 'list' action
  if (data.status !== undefined && data.action !== 'list') {
    ctx.addIssue({
      code: 'custom',
      message: `status parameter is only allowed for 'list' action, not '${data.action}'`,
      path: ['status'],
    });
  }

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

    case 'supersede':
      // BUG-014 FIX: decisionId, newDecision, newDecision.decision, and reason are all required
      if (typeof data.decisionId !== 'string' || data.decisionId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'decisionId is required for supersede action',
          path: ['decisionId'],
        });
      }
      if (data.newDecision === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'newDecision is required for supersede action',
          path: ['newDecision'],
        });
      } else {
        // Validate newDecision.decision is required and non-empty
        if (typeof data.newDecision.decision !== 'string' || data.newDecision.decision === '') {
          ctx.addIssue({
            code: 'custom',
            message: 'newDecision.decision is required for supersede action',
            path: ['newDecision', 'decision'],
          });
        }
      }
      if (typeof data.reason !== 'string' || data.reason === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'reason is required for supersede action',
          path: ['reason'],
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
    case 'list_fields':
      // Only planId is required (already validated by base schema)
      break;
  }
});

export const decisionToolDescription = 'Record architectural decisions (ADR pattern) with context and alternatives considered. Use after solution selection or for any significant technical choice. Decisions can be superseded when context changes, maintaining decision history. Link decisions to requirements/solutions for traceability. Actions: record, get, get_many, update, list, supersede, get_history, diff.';
