export const tools = [
  {
    name: 'plan',
    description: 'Manage development plans - the top-level container for all planning entities. Create a plan first before using other tools. Set active plan per workspace to avoid passing planId repeatedly. Actions: create, list, get, update, archive, set_active, get_active.',
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
    description: 'Manage project requirements - the foundation of planning workflow. Add requirements first, then propose solutions with `solution` tool to address them. Link requirements to phases for implementation tracking. Use `query` tool to trace requirement coverage. Actions: add, get, update, list, delete.',
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
    description: 'Manage solution proposals for requirements. Propose multiple solutions with tradeoff analysis, compare them to evaluate options, then select the best one. Use `decision` tool to record selection rationale. Selected solutions guide phase implementation. Actions: propose, get, update, compare, select, delete.',
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
                    unit: { type: 'string', enum: ['minutes', 'hours', 'days', 'weeks', 'story-points'] },
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
    description: 'Record architectural decisions (ADR pattern) with context and alternatives considered. Use after solution selection or for any significant technical choice. Decisions can be superseded when context changes, maintaining decision history. Link decisions to requirements/solutions for traceability. Actions: record, get, list, supersede.',
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
    description: 'Manage implementation phases/tasks in hierarchical structure. Break selected solutions into phases with objectives, deliverables, and estimates. Track progress, update status (planned/in_progress/completed/blocked), and get next actionable items. Use after solution selection. Actions: add, get, get_tree, update, update_status, move, delete, get_next_actions.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get', 'get_tree', 'update', 'update_status', 'move', 'delete', 'get_next_actions'],
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
                unit: { type: 'string', enum: ['minutes', 'hours', 'days', 'weeks', 'story-points'] },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
              },
              required: ['value', 'unit', 'confidence'],
            },
            implementationNotes: { type: 'string' },
            codeExamples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  language: { type: 'string' },
                  filename: { type: 'string' },
                  code: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['language', 'code'],
              },
            },
          },
        },
        updates: {
          type: 'object',
          description: 'Fields to update when using action=update',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            objectives: { type: 'array', items: { type: 'string' } },
            deliverables: { type: 'array', items: { type: 'string' } },
            successCriteria: { type: 'array', items: { type: 'string' } },
            status: { type: 'string', enum: ['planned', 'in_progress', 'completed', 'blocked', 'skipped'] },
            blockingReason: { type: 'string' },
            progress: { type: 'number', minimum: 0, maximum: 100 },
            implementationNotes: { type: 'string' },
            codeExamples: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  language: { type: 'string' },
                  filename: { type: 'string' },
                  code: { type: 'string' },
                  description: { type: 'string' },
                },
                required: ['language', 'code'],
              },
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
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include. Default returns summary (id, title, status, progress, path, childCount). Available fields: "description", "parentId", "order", "depth", "objectives", "deliverables", "successCriteria", "schedule", "startedAt", "completedAt", "milestones", "blockers", "implementationNotes", "codeExamples", "metadata", "createdAt", "updatedAt", "version". Use ["*"] for ALL fields (WARNING: returns large output, may pollute context).',
        },
        limit: { type: 'number' },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'artifact',
    description: 'Store generated artifacts (code, configs, migrations, docs, tests, scripts) related to phases and solutions. Track file changes with fileTable, store source code with syntax highlighting. Link artifacts to phases/solutions/requirements for traceability. Use during phase implementation. Actions: add, get, update, list, delete.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get', 'update', 'list', 'delete'],
        },
        planId: { type: 'string' },
        artifactId: { type: 'string' },
        artifact: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            artifactType: {
              type: 'string',
              enum: ['code', 'config', 'migration', 'documentation', 'test', 'script', 'other'],
            },
            content: {
              type: 'object',
              properties: {
                language: { type: 'string' },
                sourceCode: { type: 'string' },
                filename: { type: 'string' },
              },
            },
            fileTable: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  action: { type: 'string', enum: ['create', 'modify', 'delete'] },
                  description: { type: 'string' },
                },
                required: ['path', 'action'],
              },
            },
            relatedPhaseId: { type: 'string' },
            relatedSolutionId: { type: 'string' },
            relatedRequirementIds: { type: 'array', items: { type: 'string' } },
          },
        },
        updates: { type: 'object' },
        filters: {
          type: 'object',
          properties: {
            artifactType: { type: 'string' },
            status: { type: 'string' },
            relatedPhaseId: { type: 'string' },
          },
        },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'link',
    description: 'Create explicit relationships between entities for traceability. Relation types: implements (solution->requirement), addresses (phase->requirement), depends_on (phase->phase with cycle detection), blocks, alternative_to, supersedes (decision->decision), has_artifact. Use `query` trace action for impact analysis. Actions: create, get, delete.',
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
          enum: ['implements', 'addresses', 'depends_on', 'blocks', 'alternative_to', 'supersedes', 'references', 'derived_from', 'has_artifact'],
        },
        direction: { type: 'string', enum: ['outgoing', 'incoming', 'both'] },
        metadata: { type: 'object' },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'query',
    description: 'Search, analyze, and validate plans. Search entities by text/tags, trace requirement implementation path (requirements->solutions->phases), validate plan integrity (uncovered requirements, orphan solutions, broken links), export to markdown/json, check plan health. Use for analysis and quality assurance. Actions: search, trace, validate, export, health.',
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
        entityTypes: { type: 'array', items: { type: 'string', enum: ['requirement', 'solution', 'decision', 'phase', 'artifact'] } },
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
