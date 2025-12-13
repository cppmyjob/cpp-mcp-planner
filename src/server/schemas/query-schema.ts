import { z } from 'zod';

const entityTypeSchema = z.enum(['requirement', 'solution', 'decision', 'phase', 'artifact']);
const exportFormatSchema = z.enum(['markdown', 'json']);
const validationLevelSchema = z.enum(['basic', 'strict']);

export const querySchema = z.object({
  action: z.enum(['search', 'trace', 'validate', 'export', 'health']),
  planId: z.string().optional(),
  query: z.string().optional(),
  requirementId: z.string().optional(),
  entityTypes: z.array(entityTypeSchema).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  checks: z.array(z.string()).optional(),
  validationLevel: validationLevelSchema.optional(),
  format: exportFormatSchema.optional(),
  sections: z.array(z.string()).optional(),
  includeVersionHistory: z.boolean().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const queryToolDescription = 'Search, analyze, and validate plans. Search entities by text/tags, trace requirement implementation path (requirements->solutions->phases), validate plan integrity (uncovered requirements, orphan solutions, broken links), export to markdown/json, check plan health. Use for analysis and quality assurance. Actions: search, trace, validate, export, health.';
