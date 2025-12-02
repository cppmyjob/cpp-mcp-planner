// Tool definitions for MCP Planning Server

export const tools = [
  // Plan Management (7)
  {
    name: 'create_plan',
    description: 'Create a new planning document for a task or project',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Plan name' },
        description: { type: 'string', description: 'Plan description' },
        tags: { type: 'array', items: { type: 'object' }, description: 'Optional tags' },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'list_plans',
    description: 'List all planning documents with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['active', 'archived', 'all'] },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
  },
  {
    name: 'get_plan',
    description: 'Get detailed plan information including entities and statistics',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        includeEntities: { type: 'boolean', description: 'Include all entities' },
        includeLinks: { type: 'boolean', description: 'Include all links' },
        includeVersionHistory: { type: 'boolean', description: 'Include version history' },
      },
      required: ['planId'],
    },
  },
  {
    name: 'update_plan',
    description: 'Update plan metadata (name, description, status)',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['draft', 'active', 'completed', 'on_hold', 'archived'] },
      },
      required: ['planId'],
    },
  },
  {
    name: 'archive_plan',
    description: 'Archive a plan (soft delete)',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        reason: { type: 'string', description: 'Archive reason' },
      },
      required: ['planId'],
    },
  },
  {
    name: 'set_active_plan',
    description: 'Set the active plan for current workspace',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        workspaceId: { type: 'string', description: 'Workspace identifier (defaults to cwd)' },
      },
      required: ['planId'],
    },
  },
  {
    name: 'get_active_plan',
    description: 'Get the currently active plan for workspace',
    inputSchema: {
      type: 'object',
      properties: {
        workspaceId: { type: 'string', description: 'Workspace identifier' },
      },
    },
  },

  // Requirements (5)
  {
    name: 'add_requirement',
    description: 'Add a new requirement to the plan',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
        requirement: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            rationale: { type: 'string' },
            source: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['user-request', 'derived', 'constraint', 'assumption'] },
                context: { type: 'string' },
                parentId: { type: 'string' },
              },
              required: ['type'],
            },
            acceptanceCriteria: { type: 'array', items: { type: 'string' } },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            category: { type: 'string', enum: ['functional', 'non-functional', 'constraint', 'assumption'] },
            tags: { type: 'array', items: { type: 'object' } },
          },
          required: ['title', 'description', 'source', 'acceptanceCriteria', 'priority', 'category'],
        },
      },
      required: ['planId', 'requirement'],
    },
  },
  {
    name: 'get_requirement',
    description: 'Get requirement details',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        requirementId: { type: 'string' },
        includeRelated: { type: 'boolean' },
      },
      required: ['planId', 'requirementId'],
    },
  },
  {
    name: 'update_requirement',
    description: 'Update an existing requirement',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        requirementId: { type: 'string' },
        updates: { type: 'object' },
      },
      required: ['planId', 'requirementId', 'updates'],
    },
  },
  {
    name: 'list_requirements',
    description: 'List all requirements with filters',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        filters: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            priority: { type: 'string' },
            category: { type: 'string' },
          },
        },
      },
      required: ['planId'],
    },
  },
  {
    name: 'delete_requirement',
    description: 'Delete a requirement',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        requirementId: { type: 'string' },
        cascade: { type: 'boolean', description: 'Delete linked solutions/decisions' },
      },
      required: ['planId', 'requirementId'],
    },
  },

  // Solutions (6)
  {
    name: 'propose_solution',
    description: 'Propose a new solution for requirements',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        solution: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            approach: { type: 'string' },
            implementationNotes: { type: 'string' },
            tradeoffs: { type: 'array', items: { type: 'object' } },
            addressing: { type: 'array', items: { type: 'string' } },
            evaluation: {
              type: 'object',
              properties: {
                effortEstimate: { type: 'object' },
                technicalFeasibility: { type: 'string', enum: ['high', 'medium', 'low'] },
                riskAssessment: { type: 'string' },
              },
              required: ['effortEstimate', 'technicalFeasibility', 'riskAssessment'],
            },
          },
          required: ['title', 'description', 'approach', 'addressing', 'tradeoffs', 'evaluation'],
        },
      },
      required: ['planId', 'solution'],
    },
  },
  {
    name: 'get_solution',
    description: 'Get solution details',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        solutionId: { type: 'string' },
      },
      required: ['planId', 'solutionId'],
    },
  },
  {
    name: 'update_solution',
    description: 'Update a solution',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        solutionId: { type: 'string' },
        updates: { type: 'object' },
      },
      required: ['planId', 'solutionId', 'updates'],
    },
  },
  {
    name: 'compare_solutions',
    description: 'Compare multiple solutions side by side',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        solutionIds: { type: 'array', items: { type: 'string' } },
        criteria: { type: 'array', items: { type: 'string' } },
      },
      required: ['planId', 'solutionIds'],
    },
  },
  {
    name: 'select_solution',
    description: 'Select a solution as the chosen approach',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        solutionId: { type: 'string' },
        rationale: { type: 'string' },
        createDecisionRecord: { type: 'boolean' },
      },
      required: ['planId', 'solutionId', 'rationale'],
    },
  },
  {
    name: 'delete_solution',
    description: 'Delete a solution',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        solutionId: { type: 'string' },
      },
      required: ['planId', 'solutionId'],
    },
  },

  // Decisions (4)
  {
    name: 'record_decision',
    description: 'Record an architectural or design decision',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        decision: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            question: { type: 'string' },
            context: { type: 'string' },
            decision: { type: 'string' },
            consequences: { type: 'array', items: { type: 'string' } },
            alternatives: { type: 'array', items: { type: 'object' } },
          },
          required: ['title', 'question', 'context', 'decision'],
        },
      },
      required: ['planId', 'decision'],
    },
  },
  {
    name: 'get_decision',
    description: 'Get decision details',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        decisionId: { type: 'string' },
      },
      required: ['planId', 'decisionId'],
    },
  },
  {
    name: 'list_decisions',
    description: 'List all decisions with optional filters',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        status: { type: 'string', enum: ['active', 'superseded', 'deprecated', 'all'] },
        includeSuperseded: { type: 'boolean' },
      },
      required: ['planId'],
    },
  },
  {
    name: 'supersede_decision',
    description: 'Replace a decision with a new one',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        decisionId: { type: 'string' },
        newDecision: { type: 'object' },
        reason: { type: 'string' },
      },
      required: ['planId', 'decisionId', 'newDecision', 'reason'],
    },
  },

  // Phases (6)
  {
    name: 'add_phase',
    description: 'Add an implementation phase to the plan',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        phase: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            parentId: { type: 'string' },
            objectives: { type: 'array', items: { type: 'string' } },
            deliverables: { type: 'array', items: { type: 'string' } },
            successCriteria: { type: 'array', items: { type: 'string' } },
            estimatedEffort: { type: 'object' },
          },
          required: ['title', 'description', 'objectives', 'deliverables', 'successCriteria'],
        },
      },
      required: ['planId', 'phase'],
    },
  },
  {
    name: 'get_phase_tree',
    description: 'Get the hierarchical phase structure',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        includeCompleted: { type: 'boolean' },
        maxDepth: { type: 'number' },
      },
      required: ['planId'],
    },
  },
  {
    name: 'update_phase_status',
    description: 'Update phase execution status and progress',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        phaseId: { type: 'string' },
        status: { type: 'string', enum: ['planned', 'in_progress', 'completed', 'blocked', 'skipped'] },
        progress: { type: 'number', minimum: 0, maximum: 100 },
        notes: { type: 'string' },
        actualEffort: { type: 'number' },
      },
      required: ['planId', 'phaseId', 'status'],
    },
  },
  {
    name: 'move_phase',
    description: 'Reorder or reparent a phase',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        phaseId: { type: 'string' },
        newParentId: { type: 'string' },
        newOrder: { type: 'number' },
      },
      required: ['planId', 'phaseId'],
    },
  },
  {
    name: 'delete_phase',
    description: 'Delete a phase',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        phaseId: { type: 'string' },
        deleteChildren: { type: 'boolean' },
      },
      required: ['planId', 'phaseId'],
    },
  },
  {
    name: 'get_next_actions',
    description: 'Get recommended next actions based on current state',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['planId'],
    },
  },

  // Linking (3)
  {
    name: 'link_entities',
    description: 'Create a relationship between entities',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        sourceId: { type: 'string' },
        targetId: { type: 'string' },
        relationType: {
          type: 'string',
          enum: ['implements', 'depends_on', 'conflicts_with', 'alternative_to', 'derived_from', 'addresses'],
        },
        metadata: { type: 'object' },
      },
      required: ['planId', 'sourceId', 'targetId', 'relationType'],
    },
  },
  {
    name: 'get_entity_links',
    description: 'Get all links for an entity',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        entityId: { type: 'string' },
        relationType: { type: 'string' },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'] },
      },
      required: ['planId', 'entityId'],
    },
  },
  {
    name: 'unlink_entities',
    description: 'Remove a link between entities',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        linkId: { type: 'string' },
        sourceId: { type: 'string' },
        targetId: { type: 'string' },
        relationType: { type: 'string' },
      },
      required: ['planId'],
    },
  },

  // Query & Analysis (4)
  {
    name: 'search_entities',
    description: 'Search across all entities in a plan',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        query: { type: 'string' },
        entityTypes: { type: 'array', items: { type: 'string' } },
        filters: { type: 'object' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['planId', 'query'],
    },
  },
  {
    name: 'trace_requirement',
    description: 'Trace requirement through solutions, decisions, and phases',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        requirementId: { type: 'string' },
      },
      required: ['planId', 'requirementId'],
    },
  },
  {
    name: 'validate_plan',
    description: 'Check plan for consistency and completeness',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        checks: { type: 'array', items: { type: 'string' } },
      },
      required: ['planId'],
    },
  },
  {
    name: 'export_plan',
    description: 'Export plan to markdown or JSON',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        format: { type: 'string', enum: ['markdown', 'json'] },
        sections: { type: 'array', items: { type: 'string' } },
        includeVersionHistory: { type: 'boolean' },
      },
      required: ['planId', 'format'],
    },
  },

  // System (1)
  {
    name: 'planning_health_check',
    description: 'Check the health of the planning server',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];
