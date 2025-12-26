import { z } from 'zod';

// GREEN: Phase 4.14 - Project tool schema for init action
// GREEN: Phase 4.15 - Added CRUD actions (get, list, delete)

// Base schema with all fields
const baseProjectSchema = z
  .object({
    action: z.enum(['init', 'get', 'list', 'delete']), // Phase 4.15: Added get, list, delete
    workspacePath: z.string().optional(),
    projectId: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  })
  .strict();

// Type for the base schema
type ProjectInput = z.infer<typeof baseProjectSchema>;

// Schema with superRefine for required field validation based on action
export const projectSchema = baseProjectSchema.superRefine((data: ProjectInput, ctx) => {
  // GREEN: Phase 4.15 - Validation for all CRUD actions
  switch (data.action) {
    case 'init':
      // workspacePath is required
      if (typeof data.workspacePath !== 'string' || data.workspacePath === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'workspacePath is required for init action',
          path: ['workspacePath'],
        });
      }

      // projectId is required
      if (typeof data.projectId !== 'string' || data.projectId === '') {
        ctx.addIssue({
          code: 'custom',
          message: 'projectId is required for init action',
          path: ['projectId'],
        });
      }
      break;

    case 'get':
    case 'delete':
      // workspacePath is required
      if (typeof data.workspacePath !== 'string' || data.workspacePath === '') {
        ctx.addIssue({
          code: 'custom',
          message: `workspacePath is required for ${data.action} action`,
          path: ['workspacePath'],
        });
      }
      break;

    case 'list':
      // No required fields - limit and offset are optional
      break;
  }
});

export const projectToolDescription =
  'Initialize and manage project workspaces. Create .mcp-config.json files to link workspaces to projects. Each workspace can have one project configuration. Actions: init, get, list, delete.';
