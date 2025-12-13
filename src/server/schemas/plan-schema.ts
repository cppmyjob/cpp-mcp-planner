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
});

export const planSchema = z.object({
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
  includeLinks: z.boolean().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const planToolDescription = 'Manage development plans - the top-level container for all planning entities. Create a plan first before using other tools. Set active plan per workspace to avoid passing planId repeatedly. Use get_summary for plan overview (returns plan info, phase tree summary, statistics). Use includeEntities only for full export/backup - it returns large data. Actions: create, list, get, update, archive, set_active, get_active, get_summary.';
