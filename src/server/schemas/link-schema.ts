import { z } from 'zod';

const relationTypeSchema = z.enum([
  'implements',
  'addresses',
  'depends_on',
  'blocks',
  'alternative_to',
  'supersedes',
  'references',
  'derived_from',
  'has_artifact',
]);

const directionSchema = z.enum(['outgoing', 'incoming', 'both']);

export const linkSchema = z.object({
  action: z.enum(['create', 'get', 'delete']),
  planId: z.string(),
  sourceId: z.string().optional(),
  targetId: z.string().optional(),
  entityId: z.string().optional(),
  linkId: z.string().optional(),
  relationType: relationTypeSchema.optional(),
  direction: directionSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const linkToolDescription = 'Create explicit relationships between entities for traceability. Relation types: implements (solution->requirement), addresses (phase->requirement), depends_on (phase->phase with cycle detection), blocks, alternative_to, supersedes (decision->decision), has_artifact. Use `query` trace action for impact analysis. Actions: create, get, delete.';
