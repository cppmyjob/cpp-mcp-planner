import { z } from 'zod';

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
});

const decisionUpdatesSchema = z.object({
  title: z.string().optional(),
  context: z.string().optional(),
  decision: z.string().optional(),
  consequences: z.string().optional(),
});

export const decisionSchema = z.object({
  action: z.enum(['record', 'get', 'get_many', 'update', 'list', 'supersede', 'get_history', 'diff']),
  planId: z.string(),
  decisionId: z.string().optional(),
  decisionIds: z.array(z.string()).optional(),
  decision: decisionDataSchema.optional(),
  updates: decisionUpdatesSchema.optional(),
  newDecision: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
  status: decisionStatusSchema.optional(),
  fields: z.array(z.string()).optional(),
  excludeMetadata: z.boolean().optional(),
});

export const decisionToolDescription = 'Record architectural decisions (ADR pattern) with context and alternatives considered. Use after solution selection or for any significant technical choice. Decisions can be superseded when context changes, maintaining decision history. Link decisions to requirements/solutions for traceability. Actions: record, get, get_many, update, list, supersede, get_history, diff.';
