import { z } from 'zod';

const tagSchema = z.object({
  key: z.string(),
  value: z.string(),
});

const artifactTypeSchema = z.enum(['code', 'config', 'migration', 'documentation', 'test', 'script', 'other']);
const artifactStatusSchema = z.enum(['draft', 'reviewed', 'approved', 'implemented', 'outdated']);
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
  status: artifactStatusSchema.optional(),
  content: contentSchema.optional(),
  targets: z.array(targetSchema).optional(),
  relatedPhaseId: z.string().optional(),
  relatedSolutionId: z.string().optional(),
  relatedRequirementIds: z.array(z.string()).optional(),
  codeRefs: z.array(z.string()).optional(),
  tags: z.array(tagSchema).optional(),
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

// Base schema with all fields
const baseArtifactSchema = z.object({
  action: z.enum(['add', 'get', 'update', 'list', 'delete', 'get_history', 'diff']),
  planId: z.string(),
  artifactId: z.string().optional(),
  artifact: artifactDataSchema.optional(),
  updates: artifactUpdatesSchema.optional(),
  filters: artifactFiltersSchema.optional(),
  fields: z.array(z.string()).optional(),
  excludeMetadata: z.boolean().optional(),
  includeContent: z.boolean().optional(),
  // For diff action
  version1: z.number().optional(),
  version2: z.number().optional(),
});

// Type for the base schema
type ArtifactInput = z.infer<typeof baseArtifactSchema>;

// Schema with superRefine for required field validation based on action
export const artifactSchema = baseArtifactSchema.superRefine((data: ArtifactInput, ctx) => {
  switch (data.action) {
    case 'add':
      // artifact, artifact.title, and artifact.artifactType are required
      if (data.artifact === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'artifact object is required for add action',
          path: ['artifact'],
        });
        return;
      }
      if (typeof data.artifact.title !== 'string' || data.artifact.title === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'artifact.title is required for add action',
          path: ['artifact', 'title'],
        });
      }
      if (data.artifact.artifactType === undefined) {
        ctx.addIssue({
          code: 'custom',
          message: 'artifact.artifactType is required for add action',
          path: ['artifact', 'artifactType'],
        });
      }
      break;

    case 'get':
    case 'update':
    case 'delete':
    case 'get_history':
    case 'diff':
      // artifactId is required
      if (typeof data.artifactId !== 'string' || data.artifactId === '') {
        ctx.addIssue({
          code: 'custom',
          message: `artifactId is required for ${data.action} action`,
          path: ['artifactId'],
        });
      }
      break;

    case 'list':
      // Only planId is required (already validated by base schema)
      break;
  }
});

export const artifactToolDescription = 'Store generated artifacts (code, configs, migrations, docs, tests, scripts) related to phases and solutions. Track file targets with precision (lineNumber, lineEnd, searchPattern), store source code with syntax highlighting. Link artifacts to phases/solutions/requirements for traceability. Use during phase implementation. Actions: add, get, update, list, delete, get_history, diff.';
