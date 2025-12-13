import { z } from 'zod';

const prioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
const phaseStatusSchema = z.enum(['planned', 'in_progress', 'completed', 'blocked', 'skipped']);
const effortUnitSchema = z.enum(['minutes', 'hours', 'days', 'weeks', 'story-points']);
const confidenceSchema = z.enum(['low', 'medium', 'high']);

const estimatedEffortSchema = z.object({
  value: z.number(),
  unit: effortUnitSchema,
  confidence: confidenceSchema,
});

const phaseDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
  order: z.number().optional(), // Explicit order for phase positioning
  objectives: z.array(z.string()).optional(),
  deliverables: z.array(z.string()).optional(),
  successCriteria: z.array(z.string()).optional(),
  estimatedEffort: estimatedEffortSchema.optional(),
  implementationNotes: z.string().optional(),
  priority: prioritySchema.optional(),
});

const phaseUpdatesSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  objectives: z.array(z.string()).optional(),
  deliverables: z.array(z.string()).optional(),
  successCriteria: z.array(z.string()).optional(),
  status: phaseStatusSchema.optional(),
  blockingReason: z.string().optional(),
  progress: z.number().min(0).max(100).optional(),
  implementationNotes: z.string().optional(),
  priority: prioritySchema.optional(),
});

export const phaseSchema = z.object({
  action: z.enum(['add', 'get', 'get_many', 'get_tree', 'update', 'update_status', 'move', 'delete', 'get_next_actions', 'complete_and_advance', 'get_history', 'diff']),
  planId: z.string(),
  phaseId: z.string().optional(),
  phaseIds: z.array(z.string()).optional(),
  phase: phaseDataSchema.optional(),
  updates: phaseUpdatesSchema.optional(),
  status: phaseStatusSchema.optional(),
  progress: z.number().min(0).max(100).optional(),
  notes: z.string().optional(),
  actualEffort: z.number().optional(),
  newParentId: z.string().optional(),
  newOrder: z.number().optional(),
  deleteChildren: z.boolean().optional(),
  includeCompleted: z.boolean().optional(),
  maxDepth: z.number().optional(),
  fields: z.array(z.string()).optional(),
  excludeMetadata: z.boolean().optional(),
  excludeComputed: z.boolean().optional(),
  limit: z.number().optional(),
});

export const phaseToolDescription = 'Manage implementation phases/tasks in hierarchical structure. Break selected solutions into phases with objectives, deliverables, and estimates. Track progress, update status (planned/in_progress/completed/blocked), and get next actionable items. For plan overview/summary, use get_tree with fields parameter to get compact tree. Use link tool with depends_on relation to create phase dependencies with cycle detection. Use after solution selection. Actions: add, get, get_many, get_tree, update, update_status, move, delete, get_next_actions, complete_and_advance, get_history, diff.';
