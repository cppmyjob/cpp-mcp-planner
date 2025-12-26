import { z } from 'zod';

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const planStatusSchema = z.enum(['active', 'archived', 'completed']);

const planUpdatesSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  status: planStatusSchema.optional(),
  enableHistory: z.boolean().optional(),
  maxHistoryDepth: z.number().optional(),
});

// Base schema with all fields
const basePlanSchema = z
  .object({
    action: z.enum(['create', 'list', 'get', 'update', 'archive', 'set_active', 'get_active', 'get_summary']),
    planId: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    status: planStatusSchema.optional(),
    updates: planUpdatesSchema.optional(),
    tags: z.array(tagSchema).optional(),
    reason: z.string().optional(),
    workspacePath: z.string().optional(),
    includeGuide: z.boolean().optional(),
    includeEntities: z.boolean().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    // GREEN: Phase 4.3 - Add projectId for list filtering
    projectId: z.string().optional(),
    // Sprint 7: Version history settings
    enableHistory: z.boolean().optional(),
    maxHistoryDepth: z.number().optional(),
  })
  .strict(); // Reject unknown fields like includeLinks

// Type for the base schema
type PlanInput = z.infer<typeof basePlanSchema>;

// Schema with superRefine for required field validation based on action
export const planSchema = basePlanSchema.superRefine((data: PlanInput, ctx) => {
  switch (data.action) {
    case 'create':
      // name is required
      if (typeof data.name !== 'string' || data.name === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'name is required for create action',
          path: ['name'],
        });
      }
      break;

    case 'get':
    case 'update':
    case 'archive':
      // planId is required
      if (typeof data.planId !== 'string' || data.planId === '') {
        ctx.addIssue({
          code: 'custom',
          message: `planId is required for ${data.action} action`,
          path: ['planId'],
        });
      }
      break;

    case 'get_summary':
      // planId is required
      if (typeof data.planId !== 'string' || data.planId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'planId is required for get_summary action',
          path: ['planId'],
        });
      }

      // Explicitly reject includeGuide (not implemented for get_summary)
      if (data.includeGuide !== undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'includeGuide is not supported for get_summary action. Use get_active instead.',
          path: ['includeGuide'],
        });
      }
      break;

    case 'set_active':
      // planId is required, workspacePath is optional (defaults to process.cwd() in service)
      if (typeof data.planId !== 'string' || data.planId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'planId is required for set_active action',
          path: ['planId'],
        });
      }
      break;

    case 'get_active':
      // workspacePath is optional (defaults to process.cwd() in service)
      break;

    case 'list':
      // No required fields beyond action
      break;
  }
});

export const planToolDescription = 'Manage development plans - the top-level container for all planning entities. Create a plan first before using other tools. Set active plan per workspace to avoid passing planId repeatedly. Use get_summary for plan overview (returns plan info, phase tree summary, statistics). Use includeEntities only for full export/backup - it returns large data. Version history: enable with enableHistory (default: false), maxHistoryDepth (0-10, default: 5 when enabled). Actions: create, list, get, update, archive, set_active, get_active, get_summary.';
