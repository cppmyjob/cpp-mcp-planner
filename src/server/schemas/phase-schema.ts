import { z } from 'zod';

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const milestoneSchema = z.object({
  id: z.string(),
  title: z.string(),
  completed: z.boolean(),
  completedAt: z.string().optional(),
});

const blockerSchema = z.object({
  description: z.string(),
  reportedAt: z.string(),
  resolvedAt: z.string().optional(),
});

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
  // Schedule dates (kept flat to match current pattern)
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dueDate: z.string().optional(),
  // Progress tracking
  milestones: z.array(milestoneSchema).optional(),
  blockers: z.array(blockerSchema).optional(),
  tags: z.array(tagSchema).optional(),
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

// Base schema with all fields
const basePhaseSchema = z.object({
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
  // For diff action
  version1: z.number().optional(),
  version2: z.number().optional(),
});

// Type for the base schema
type PhaseInput = z.infer<typeof basePhaseSchema>;

// Schema with superRefine for required field validation based on action
export const phaseSchema = basePhaseSchema.superRefine((data: PhaseInput, ctx) => {
  switch (data.action) {
    case 'add':
      // phase and phase.title are required
      if (data.phase === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'phase object is required for add action',
          path: ['phase'],
        });
        return;
      }
      if (typeof data.phase.title !== 'string' || data.phase.title === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'phase.title is required for add action',
          path: ['phase', 'title'],
        });
      }
      break;

    case 'get':
    case 'update':
    case 'update_status':
    case 'move':
    case 'delete':
    case 'complete_and_advance':
    case 'get_history':
    case 'diff':
      // phaseId is required
      if (typeof data.phaseId !== 'string' || data.phaseId === '') {
        ctx.addIssue({
          code: 'custom',
          message: `phaseId is required for ${data.action} action`,
          path: ['phaseId'],
        });
      }
      break;

    case 'get_many':
      // phaseIds is required
      if (!Array.isArray(data.phaseIds) || data.phaseIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'phaseIds is required for get_many action',
          path: ['phaseIds'],
        });
      }
      break;

    case 'get_tree':
    case 'get_next_actions':
      // Only planId is required (already validated by base schema)
      break;
  }
});

export const phaseToolDescription = 'Manage implementation phases/tasks in hierarchical structure. Break selected solutions into phases with objectives, deliverables, and estimates. Track progress, update status (planned/in_progress/completed/blocked), and get next actionable items. For plan overview/summary, use get_tree with fields parameter to get compact tree. Use link tool with depends_on relation to create phase dependencies with cycle detection. Use after solution selection. Actions: add, get, get_many, get_tree, update, update_status, move, delete, get_next_actions, complete_and_advance, get_history, diff.';
