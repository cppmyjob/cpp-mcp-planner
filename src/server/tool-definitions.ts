export const tools = [
  {
    name: 'plan',
    description: 'Manage development plans - the top-level container for all planning entities. Create a plan first before using other tools. Set active plan per workspace to avoid passing planId repeatedly. Use get_summary for plan overview (returns plan info, phase tree summary, statistics). Use includeEntities only for full export/backup - it returns large data. Actions: create, list, get, update, archive, set_active, get_active, get_summary.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'list', 'get', 'update', 'archive', 'set_active', 'get_active', 'get_summary'],
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
        includeGuide: {
          type: 'boolean',
          description: 'Include usage guide in get_active response. Default: false (omit this parameter to exclude guide, saving ~2.5KB). The guide provides essential commands, formatting instructions, and best practices for working with the planner. Set to true on first call to see the guide, then omit or use false for subsequent calls.',
        },
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
    description: 'Manage project requirements - the foundation of planning workflow. Add requirements first, then propose solutions with `solution` tool to address them. Link requirements to phases for implementation tracking. Use `query` tool to trace requirement coverage. Use vote/unvote to prioritize requirements based on user feedback - each requirement has a votes field (default: 0) that can be incremented/decremented. . Use reset_all_votes to reset all requirement votes to 0 in a plan. Actions: add, get, get_many, update, list, delete, vote, unvote, get_history, diff, reset_all_votes',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get', 'get_many', 'update', 'list', 'delete', 'vote', 'unvote', 'get_history', 'diff', 'reset_all_votes'],
        },
        planId: { type: 'string' },
        requirementId: { type: 'string' },
        requirementIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of requirement IDs for get_many action. Max 100 IDs.',
        },
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
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include. Default returns summary (id, title, description, priority, category, status, votes). Available fields: "rationale", "source", "acceptanceCriteria", "impact", "metadata", "createdAt", "updatedAt", "version". Use ["*"] for ALL fields (WARNING: returns large output, may pollute context).',
        },
        excludeMetadata: {
          type: 'boolean',
          description: 'Exclude metadata fields (createdAt, updatedAt, version, metadata, type) from response. Saves ~162 bytes per entity.',
        },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'solution',
    description: 'Manage solution proposals for requirements. Propose multiple solutions with tradeoff analysis, compare them to evaluate options, then select the best one. Use `decision` tool to record selection rationale. Selected solutions guide phase implementation. Actions: propose, get, get_many, update, list, compare, select, delete, get_history, diff.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['propose', 'get', 'get_many', 'update', 'list', 'compare', 'select', 'delete', 'get_history', 'diff'],
        },
        planId: { type: 'string' },
        solutionId: { type: 'string' },
        solutionIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of solution IDs for get_many or compare actions. Max 100 IDs for get_many.',
        },
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
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include. Default returns summary (id, title, description, status, addressing). Available fields: "approach", "implementationNotes", "tradeoffs", "evaluation", "selectedAt", "selectedBy", "metadata", "createdAt", "updatedAt", "version". Use ["*"] for ALL fields (WARNING: returns large output, may pollute context).',
        },
        excludeMetadata: {
          type: 'boolean',
          description: 'Exclude metadata fields (createdAt, updatedAt, version, metadata, type) from response. Saves ~162 bytes per entity.',
        },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'decision',
    description: 'Record architectural decisions (ADR pattern) with context and alternatives considered. Use after solution selection or for any significant technical choice. Decisions can be superseded when context changes, maintaining decision history. Link decisions to requirements/solutions for traceability. Actions: record, get, get_many, update, list, supersede, get_history, diff.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['record', 'get', 'get_many', 'update', 'list', 'supersede', 'get_history', 'diff'],
        },
        planId: { type: 'string' },
        decisionId: { type: 'string' },
        decisionIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of decision IDs for get_many action. Max 100 IDs.',
        },
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
        updates: {
          type: 'object',
          description: 'Partial update of decision fields for action=update',
          properties: {
            title: { type: 'string' },
            context: { type: 'string' },
            decision: { type: 'string' },
            consequences: { type: 'string' },
          },
        },
        newDecision: { type: 'object' },
        reason: { type: 'string' },
        status: { type: 'string', enum: ['active', 'superseded', 'reversed'] },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include. Default returns summary (id, title, question, decision, status). Available fields: "context", "consequences", "alternativesConsidered", "supersededBy", "metadata", "createdAt", "updatedAt", "version". Use ["*"] for ALL fields (WARNING: returns large output, may pollute context).',
        },
        excludeMetadata: {
          type: 'boolean',
          description: 'Exclude metadata fields (createdAt, updatedAt, version, metadata, type) from response. Saves ~162 bytes per entity.',
        },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'phase',
    description: 'Manage implementation phases/tasks in hierarchical structure. Break selected solutions into phases with objectives, deliverables, and estimates. Track progress, update status (planned/in_progress/completed/blocked), and get next actionable items. For plan overview/summary, use get_tree with fields parameter to get compact tree. Use link tool with depends_on relation to create phase dependencies with cycle detection. Use after solution selection. Actions: add, get, get_many, get_tree, update, update_status, move, delete, get_next_actions, complete_and_advance, get_history, diff.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get', 'get_many', 'get_tree', 'update', 'update_status', 'move', 'delete', 'get_next_actions', 'complete_and_advance', 'get_history', 'diff'],
        },
        planId: { type: 'string' },
        phaseId: { type: 'string' },
        phaseIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of phase IDs for get_many action. Max 100 IDs.',
        },
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
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Phase priority for sorting in get_next_actions. Defaults to medium.',
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
            priority: {
              type: 'string',
              enum: ['critical', 'high', 'medium', 'low'],
              description: 'Phase priority. Defaults to medium.',
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
          description: 'Fields to include. Default returns summary (id, title, status, progress, path, childCount). Available fields: "description", "parentId", "order", "depth", "objectives", "deliverables", "successCriteria", "schedule", "startedAt", "completedAt", "milestones", "blockers", "implementationNotes", "metadata", "createdAt", "updatedAt", "version". Use ["*"] for ALL fields (WARNING: returns large output, may pollute context).',
        },
        excludeMetadata: {
          type: 'boolean',
          description: 'Exclude metadata fields (createdAt, updatedAt, version, metadata, type) from response. Saves ~162 bytes per entity.',
        },
        excludeComputed: {
          type: 'boolean',
          description: 'Exclude computed fields (depth, path, childCount) from response. Saves ~50 bytes per entity. Only applies to phase entities.',
        },
        limit: { type: 'number' },
      },
      required: ['action', 'planId'],
    },
  },
  {
    name: 'artifact',
    description: 'Store generated artifacts (code, configs, migrations, docs, tests, scripts) related to phases and solutions. Track file targets with precision (lineNumber, lineEnd, searchPattern), store source code with syntax highlighting. Link artifacts to phases/solutions/requirements for traceability. Use during phase implementation. Actions: add, get, update, list, delete, get_history, diff.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['add', 'get', 'update', 'list', 'delete', 'get_history', 'diff'],
        },
        planId: { type: 'string' },
        artifactId: { type: 'string' },
        artifact: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            slug: {
              type: 'string',
              description: 'URL-friendly identifier (auto-generated from title if not provided). Must be lowercase alphanumeric with dashes, max 100 chars.',
            },
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
            targets: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  action: { type: 'string', enum: ['create', 'modify', 'delete'] },
                  lineNumber: { type: 'number', description: 'Specific line to target (1-indexed)' },
                  lineEnd: { type: 'number', description: 'End line for range (inclusive, requires lineNumber)' },
                  searchPattern: { type: 'string', description: 'Regex to find location (conflicts with lineNumber)' },
                  description: { type: 'string' },
                },
                required: ['path', 'action'],
              },
            },
            relatedPhaseId: { type: 'string' },
            relatedSolutionId: { type: 'string' },
            relatedRequirementIds: { type: 'array', items: { type: 'string' } },
            codeRefs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Code references in format "file_path:line_number" (e.g., "src/services/artifact-service.ts:100")',
            },
          },
        },
        updates: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            slug: { type: 'string', description: 'Update slug (must be unique within plan)' },
            status: { type: 'string' },
            content: { type: 'object' },
            fileTable: { type: 'array' },
            targets: { type: 'array' },
            relatedPhaseId: { type: 'string' },
            relatedSolutionId: { type: 'string' },
            relatedRequirementIds: { type: 'array' },
            codeRefs: {
              type: 'array',
              items: { type: 'string' },
              description: 'Code references in format "file_path:line_number"',
            },
          },
        },
        filters: {
          type: 'object',
          properties: {
            artifactType: { type: 'string' },
            status: { type: 'string' },
            relatedPhaseId: { type: 'string' },
          },
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to include. Default returns summary (id, title, slug, artifactType, status). Available fields: "description", "content" (excluding sourceCode unless fields=["*"]), "fileTable", "targets", "relatedPhaseId", "relatedSolutionId", "relatedRequirementIds", "codeRefs", "metadata", "createdAt", "updatedAt", "version". Use ["*"] for ALL fields including sourceCode (WARNING: sourceCode can be 5-50KB, returns large output, may pollute context).',
        },
        excludeMetadata: {
          type: 'boolean',
          description: 'Exclude metadata fields (createdAt, updatedAt, version, metadata, type) from response. Saves ~162 bytes per entity.',
        },
        includeContent: {
          type: 'boolean',
          description: 'Include heavy sourceCode field (default: false for Lazy-Load). sourceCode can be 5-50KB and is excluded by default to minimize payload. Use includeContent=true ONLY when you need to read the actual source code. IMPORTANT: list operations NEVER return sourceCode even with includeContent=true (security measure).',
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
        validationLevel: { type: 'string', enum: ['basic', 'strict'], description: 'Validation level: "basic" (default, errors only) or "strict" (all issues including warnings and infos)' },
        format: { type: 'string', enum: ['markdown', 'json'] },
        sections: { type: 'array', items: { type: 'string' } },
        includeVersionHistory: { type: 'boolean' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['action'],
    },
  },
  {
    name: 'batch',
    description: 'Execute multiple planning operations atomically in a single transaction. All operations succeed together or all fail (rollback). Supports temp IDs ($0, $1, $2, ...) for referencing entities created within the same batch. Temp IDs are resolved to real UUIDs after entity creation. Supports both create and update operations - use action: "update" in payload with id and updates fields to update existing entities. Use batch for: creating complex dependency trees, bulk imports, bulk updates, setting up initial project structure. Actions: execute.',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string' },
        operations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              entityType: {
                type: 'string',
                enum: ['requirement', 'solution', 'phase', 'link', 'decision', 'artifact'],
              },
              payload: {
                type: 'object',
                description: 'Entity-specific payload. For temp ID support, use tempId field. For referencing other entities in the batch, use $0, $1, $2, etc. in ID fields (parentId, addressing, sourceId, targetId, relatedPhaseId, relatedSolutionId, relatedRequirementIds, source.parentId). For update operations, set action: "update", id: entity_id, and updates: {...fields to update}.',
              },
            },
            required: ['entityType', 'payload'],
          },
        },
      },
      required: ['planId', 'operations'],
    },
  },
];
