export const tools = [
  {
    name: 'plan',
    description: 'Manage plans: create, list, get, update, archive, set_active, get_active',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'get', 'update', 'archive', 'set_active', 'get_active'],
        },
        planId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string', enum: ['active', 'archived', 'completed'] },
        updates: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['active', 'archived', 'completed'] },
          },
        },
        tags: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string' },
              value: { type: 'string' },
            },
            required: ['key', 'value'],
          },
        },
        reason: { type: 'string' },
        workspacePath: { type: 'string' },
        includeEntities: { type: 'boolean' },
        includeLinks: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },
  {
    name: 'requirement',
    description: 'Manage requirements: add, get, update, list, delete',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get', 'update', 'list', 'delete'],
        },
        planId: { type: 'string' },
        requirementId: { type: 'string' },
        requirement: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            rationale: { type: 'string' },
            source: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['user-request', 'discovered', 'derived'] },
                context: { type: 'string' },
                parentId: { type: 'string' },
              },
              required: ['type'],
            },
            acceptanceCriteria: { type: 'array', items: { type: 'string' } },
            priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
            category: { type: 'string', enum: ['functional', 'non-functional', 'technical', 'business'] },
            tags: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  key: { type: 'string' },
                  value: { type: 'string' },
                },
                required: ['key', 'value'],
              },
            },
          },
        },
        updates: { type: 'object' },
        filters: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            priority: { type: 'string' },
            category: { type: 'string' },
          },
        },
        includeTraceability: { type: 'boolean' },
        force: { type: 'boolean' },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'solution',
    description: 'Manage solutions: propose, get, update, compare, select, delete',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['propose', 'get', 'update', 'compare', 'select', 'delete'],
        },
        planId: { type: 'string' },
        solutionId: { type: 'string' },
        solutionIds: { type: 'array', items: { type: 'string' } },
        solution: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            approach: { type: 'string' },
            implementationNotes: { type: 'string' },
            tradeoffs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  aspect: { type: 'string' },
                  pros: { type: 'array', items: { type: 'string' } },
                  cons: { type: 'array', items: { type: 'string' } },
                  score: { type: 'number' },
                },
                required: ['aspect', 'pros', 'cons'],
              },
            },
            addressing: { type: 'array', items: { type: 'string' } },
            evaluation: {
              type: 'object',
              properties: {
                effortEstimate: {
                  type: 'object',
                  properties: {
                    value: { type: 'number' },
                    unit: { type: 'string', enum: ['hours', 'days', 'weeks', 'story-points'] },
                    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                  },
                  required: ['value', 'unit', 'confidence'],
                },
                technicalFeasibility: { type: 'string', enum: ['high', 'medium', 'low'] },
                riskAssessment: { type: 'string' },
              },
            },
          },
        },
        updates: { type: 'object' },
        aspects: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
        createDecisionRecord: { type: 'boolean' },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'decision',
    description: 'Manage decisions: record, get, list, supersede',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['record', 'get', 'list', 'supersede'],
        },
        planId: { type: 'string' },
        decisionId: { type: 'string' },
        decision: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            question: { type: 'string' },
            context: { type: 'string' },
            decision: { type: 'string' },
            consequences: { type: 'string' },
            alternativesConsidered: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  option: { type: 'string' },
                  reasoning: { type: 'string' },
                  whyNotChosen: { type: 'string' },
                },
                required: ['option', 'reasoning'],
              },
            },
          },
        },
        newDecision: { type: 'object' },
        reason: { type: 'string' },
        status: { type: 'string', enum: ['active', 'superseded', 'reversed'] },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'phase',
    description: 'Manage phases: add, get_tree, update_status, move, delete, get_next_actions',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get_tree', 'update_status', 'move', 'delete', 'get_next_actions'],
        },
        planId: { type: 'string' },
        phaseId: { type: 'string' },
        phase: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            parentId: { type: 'string' },
            objectives: { type: 'array', items: { type: 'string' } },
            deliverables: { type: 'array', items: { type: 'string' } },
            successCriteria: { type: 'array', items: { type: 'string' } },
            estimatedEffort: {
              type: 'object',
              properties: {
                value: { type: 'number' },
                unit: { type: 'string', enum: ['hours', 'days', 'weeks', 'story-points'] },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              },
              required: ['value', 'unit', 'confidence'],
            },
          },
        },
        status: { type: 'string', enum: ['planned', 'in_progress', 'completed', 'blocked', 'skipped'] },
        progress: { type: 'number', minimum: 0, maximum: 100 },
        notes: { type: 'string' },
        actualEffort: { type: 'number' },
        newParentId: { type: 'string' },
        newOrder: { type: 'number' },
        deleteChildren: { type: 'boolean' },
        includeCompleted: { type: 'boolean' },
        maxDepth: { type: 'number' },
        limit: { type: 'number' },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'link',
    description: 'Manage entity links: create, get, delete',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'get', 'delete'],
        },
        planId: { type: 'string' },
        sourceId: { type: 'string' },
        targetId: { type: 'string' },
        entityId: { type: 'string' },
        linkId: { type: 'string' },
        relationType: {
          type: 'string',
          enum: ['implements', 'addresses', 'depends_on', 'blocks', 'alternative_to', 'supersedes', 'references', 'derived_from'],
        },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'] },
        metadata: { type: 'object' },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'query',
    description: 'Query and analyze: search, trace, validate, export, health',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['search', 'trace', 'validate', 'export', 'health'],
        },
        planId: { type: 'string' },
        query: { type: 'string' },
        requirementId: { type: 'string' },
        entityTypes: { type: 'array', items: { type: 'string' } },
        filters: { type: 'object' },
        checks: { type: 'array', items: { type: 'string' } },
        format: { type: 'string', enum: ['markdown', 'json'] },
        sections: { type: 'array', items: { type: 'string' } },
        includeVersionHistory: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },
];
