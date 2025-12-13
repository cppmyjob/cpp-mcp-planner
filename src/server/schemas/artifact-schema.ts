import { z } from 'zod';

const artifactTypeSchema = z.enum(['code', 'config', 'migration', 'documentation', 'test', 'script', 'other']);
const targetActionSchema = z.enum(['create', 'modify', 'delete']);

const contentSchema = z.object({
  language: z.string().optional(),
  sourceCode: z.string().optional(),
  filename: z.string().optional(),
});

const targetSchema = z.object({
  path: z.string(),
  action: targetActionSchema,
  lineNumber: z.number().optional(),
  lineEnd: z.number().optional(),
  searchPattern: z.string().optional(),
  description: z.string().optional(),
});

const artifactDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
  artifactType: artifactTypeSchema.optional(),
  content: contentSchema.optional(),
  targets: z.array(targetSchema).optional(),
  relatedPhaseId: z.string().optional(),
  relatedSolutionId: z.string().optional(),
  relatedRequirementIds: z.array(z.string()).optional(),
  codeRefs: z.array(z.string()).optional(),
});

const artifactUpdatesSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  targets: z.array(z.record(z.string(), z.unknown())).optional(),
  relatedPhaseId: z.string().optional(),
  relatedSolutionId: z.string().optional(),
  relatedRequirementIds: z.array(z.string()).optional(),
  codeRefs: z.array(z.string()).optional(),
});

const artifactFiltersSchema = z.object({
  artifactType: z.string().optional(),
  status: z.string().optional(),
  relatedPhaseId: z.string().optional(),
});

export const artifactSchema = z.object({
  action: z.enum(['add', 'get', 'update', 'list', 'delete', 'get_history', 'diff']),
  planId: z.string(),
  artifactId: z.string().optional(),
  artifact: artifactDataSchema.optional(),
  updates: artifactUpdatesSchema.optional(),
  filters: artifactFiltersSchema.optional(),
  fields: z.array(z.string()).optional(),
  excludeMetadata: z.boolean().optional(),
  includeContent: z.boolean().optional(),
});

export const artifactToolDescription = 'Store generated artifacts (code, configs, migrations, docs, tests, scripts) related to phases and solutions. Track file targets with precision (lineNumber, lineEnd, searchPattern), store source code with syntax highlighting. Link artifacts to phases/solutions/requirements for traceability. Use during phase implementation. Actions: add, get, update, list, delete, get_history, diff.';
