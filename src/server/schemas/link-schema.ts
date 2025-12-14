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

// Base schema with all fields
const baseLinkSchema = z.object({
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

// Type for the base schema
type LinkInput = z.infer<typeof baseLinkSchema>;

// Schema with superRefine for required field validation based on action
export const linkSchema = baseLinkSchema.superRefine((data: LinkInput, ctx) => {
  switch (data.action) {
    case 'create':
      // sourceId, targetId, relationType are required
      if (typeof data.sourceId !== 'string' || data.sourceId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'sourceId is required for create action',
          path: ['sourceId'],
        });
      }
      if (typeof data.targetId !== 'string' || data.targetId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'targetId is required for create action',
          path: ['targetId'],
        });
      }
      if (data.relationType === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'relationType is required for create action',
          path: ['relationType'],
        });
      }
      break;

    case 'delete':
      // linkId is required
      if (typeof data.linkId !== 'string' || data.linkId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'linkId is required for delete action',
          path: ['linkId'],
        });
      }
      break;

    case 'get':
      // Either entityId or linkId should be provided (but both optional for flexibility)
      break;
  }
});

export const linkToolDescription = 'Create explicit relationships between entities for traceability. Relation types: implements (solution->requirement), addresses (phase->requirement), depends_on (phase->phase with cycle detection), blocks, alternative_to, supersedes (decision->decision), has_artifact. Use `query` trace action for impact analysis. Actions: create, get, delete.';
