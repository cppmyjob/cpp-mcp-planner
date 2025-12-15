import { describe, it, expect } from '@jest/globals';
import type {
  FilterOperator,
  FilterCondition,
  Filter,
  SortDirection,
  SortSpec,
  Pagination,
  QueryOptions,
  QueryResult,
  ReadRepository,
  WriteRepository,
  BulkRepository,
  Repository,
  LinkRepository,
  UnitOfWork,
  IsolationLevel,
  StorageBackend,
  StorageConfig,
  RepositoryFactory,
  Requirement,
  Phase,
} from '@mcp-planner/core';

describe('Repository Interfaces - Type System', () => {
  describe('Filter Operators', () => {
    it('should define all filter operators', () => {
      const operators: FilterOperator[] = [
        'eq', 'ne', 'gt', 'gte', 'lt', 'lte',
        'in', 'nin', 'contains', 'startsWith', 'endsWith',
        'exists', 'regex'
      ];

      // Type checking - this will fail at compile time if types don't match
      operators.forEach(op => {
        const unused: FilterOperator = op;
        expect(typeof op).toBe('string');
        expect(unused).toBeDefined();
      });
    });

    it('should create filter conditions', () => {
      const condition: FilterCondition<Requirement> = {
        field: 'priority',
        operator: 'eq',
        value: 'high',
      };

      expect(condition.field).toBe('priority');
      expect(condition.operator).toBe('eq');
      expect(condition.value).toBe('high');
    });

    it('should support complex filters with nested conditions', () => {
      const filter: Filter<Requirement> = {
        operator: 'and',
        conditions: [
          { field: 'status', operator: 'eq', value: 'approved' },
          { field: 'priority', operator: 'in', value: ['high', 'critical'] },
        ],
        nested: [
          {
            operator: 'or',
            conditions: [
              { field: 'category', operator: 'eq', value: 'functional' },
              { field: 'category', operator: 'eq', value: 'business' },
            ],
          },
        ],
      };

      expect(filter.operator).toBe('and');
      expect(filter.conditions).toHaveLength(2);
      expect(filter.nested).toHaveLength(1);
    });
  });

  describe('Sort and Pagination', () => {
    it('should define sort directions', () => {
      const asc: SortDirection = 'asc';
      const desc: SortDirection = 'desc';

      expect(asc).toBe('asc');
      expect(desc).toBe('desc');
    });

    it('should create sort specifications', () => {
      const sort: SortSpec<Phase> = {
        field: 'order',
        direction: 'asc',
      };

      expect(sort.field).toBe('order');
      expect(sort.direction).toBe('asc');
    });

    it('should create pagination options', () => {
      const pagination: Pagination = {
        offset: 0,
        limit: 20,
      };

      expect(pagination.offset).toBe(0);
      expect(pagination.limit).toBe(20);
    });
  });

  describe('Query Options', () => {
    it('should create complete query options', () => {
      const options: QueryOptions<Requirement> = {
        filter: {
          conditions: [
            { field: 'status', operator: 'eq', value: 'approved' },
          ],
        },
        sort: [
          { field: 'priority', direction: 'desc' },
          { field: 'createdAt', direction: 'asc' },
        ],
        pagination: {
          offset: 0,
          limit: 50,
        },
        includeMetadata: true,
      };

      expect(options.filter?.conditions).toHaveLength(1);
      expect(options.sort).toHaveLength(2);
      expect(options.pagination?.limit).toBe(50);
      expect(options.includeMetadata).toBe(true);
    });

    it('should support partial query options', () => {
      const filterOnly: QueryOptions<Phase> = {
        filter: {
          conditions: [{ field: 'status', operator: 'eq', value: 'in_progress' }],
        },
      };

      const sortOnly: QueryOptions<Phase> = {
        sort: [{ field: 'order', direction: 'asc' }],
      };

      expect(filterOnly.filter).toBeDefined();
      expect(filterOnly.sort).toBeUndefined();
      expect(sortOnly.sort).toBeDefined();
      expect(sortOnly.filter).toBeUndefined();
    });
  });

  describe('Query Result', () => {
    it('should structure query results with metadata', () => {
      const result: QueryResult<Requirement> = {
        items: [],
        total: 100,
        offset: 0,
        limit: 20,
        hasMore: true,
      };

      expect(result.items).toEqual([]);
      expect(result.total).toBe(100);
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(20);
      expect(result.hasMore).toBe(true);
    });

    it('should indicate no more results', () => {
      const result: QueryResult<Phase> = {
        items: [],
        total: 15,
        offset: 0,
        limit: 20,
        hasMore: false,
      };

      expect(result.hasMore).toBe(false);
    });
  });

  describe('Repository Interface Structure', () => {
    it('should define read repository methods', () => {
      // Type-only test - verifies interface structure at compile time
      const readMethods: (keyof ReadRepository<Requirement>)[] = [
        'findById',
        'findByIdOrNull',
        'exists',
        'findByIds',
        'findAll',
        'query',
        'count',
        'findOne',
      ];

      expect(readMethods).toHaveLength(8);
    });

    it('should define write repository methods', () => {
      const writeMethods: (keyof WriteRepository<Requirement>)[] = [
        'create',
        'update',
        'delete',
        'deleteMany',
      ];

      expect(writeMethods).toHaveLength(4);
    });

    it('should define bulk repository methods', () => {
      const bulkMethods: (keyof BulkRepository<Requirement>)[] = [
        'createMany',
        'updateMany',
        'upsertMany',
      ];

      expect(bulkMethods).toHaveLength(3);
    });

    it('should combine all methods in Repository interface', () => {
      // Repository extends all three interfaces
      const allMethods: (keyof Repository<Requirement>)[] = [
        // ReadRepository
        'findById', 'findByIdOrNull', 'exists', 'findByIds', 'findAll', 'query', 'count', 'findOne',
        // WriteRepository
        'create', 'update', 'delete', 'deleteMany',
        // BulkRepository
        'createMany', 'updateMany', 'upsertMany',
        // Own property
        'entityType',
      ];

      expect(allMethods).toHaveLength(16);
    });
  });

  describe('Link Repository Interface', () => {
    it('should define link management methods', () => {
      const linkMethods: (keyof LinkRepository)[] = [
        'createLink',
        'getLinkById',
        'findLinksBySource',
        'findLinksByTarget',
        'findLinksByEntity',
        'deleteLink',
        'deleteLinksForEntity',
        'linkExists',
      ];

      expect(linkMethods).toHaveLength(8);
    });
  });

  describe('Unit of Work Interface', () => {
    it('should define transaction methods', () => {
      const uowMethods: (keyof UnitOfWork)[] = [
        'begin',
        'commit',
        'rollback',
        'isActive',
        'execute',
      ];

      expect(uowMethods).toHaveLength(5);
    });

    it('should define isolation levels', () => {
      const levels: IsolationLevel[] = [
        'read_uncommitted',
        'read_committed',
        'repeatable_read',
        'serializable',
      ];

      levels.forEach(level => {
        const unused: IsolationLevel = level;
        expect(typeof level).toBe('string');
        expect(unused).toBeDefined();
      });
    });
  });

  describe('Storage Configuration', () => {
    it('should define storage backends', () => {
      const backends: StorageBackend[] = [
        'file',
        'sqlite',
        'postgresql',
        'mongodb',
      ];

      backends.forEach(backend => {
        const unused: StorageBackend = backend;
        expect(typeof backend).toBe('string');
        expect(unused).toBeDefined();
      });
    });

    it('should create file storage config', () => {
      const config: StorageConfig = {
        backend: 'file',
        path: '/data/plans',
        options: {
          encoding: 'utf-8',
        },
      };

      expect(config.backend).toBe('file');
      expect(config.path).toBe('/data/plans');
      expect(config.options?.encoding).toBe('utf-8');
    });

    it('should create database storage config', () => {
      const config: StorageConfig = {
        backend: 'postgresql',
        connectionString: 'postgresql://localhost:5432/planner',
        options: {
          poolSize: 10,
          ssl: true,
        },
      };

      expect(config.backend).toBe('postgresql');
      expect(config.connectionString).toBeDefined();
      expect(config.options?.poolSize).toBe(10);
    });
  });

  describe('Repository Factory Interface', () => {
    it('should define factory methods', () => {
      const factoryMethods: (keyof RepositoryFactory)[] = [
        'createRepository',
        'createLinkRepository',
        'createUnitOfWork',
        'getBackend',
        'close',
      ];

      expect(factoryMethods).toHaveLength(5);
    });
  });

  describe('Type Safety', () => {
    it('should enforce entity type constraints', () => {
      // This test verifies type constraints at compile time
      // If these assignments compile, the types are correct

      const requirementFilter: Filter<Requirement> = {
        conditions: [
          { field: 'title', operator: 'contains', value: 'test' },
          { field: 'priority', operator: 'in', value: ['high', 'critical'] },
        ],
      };

      const phaseFilter: Filter<Phase> = {
        conditions: [
          { field: 'status', operator: 'eq', value: 'in_progress' },
          { field: 'order', operator: 'gte', value: 1 },
        ],
      };

      expect(requirementFilter.conditions).toHaveLength(2);
      expect(phaseFilter.conditions).toHaveLength(2);
    });

    it('should support generic type inference', () => {
      // Verify that QueryResult works with any entity type
      const requirementResult: QueryResult<Requirement> = {
        items: [],
        total: 0,
        offset: 0,
        limit: 20,
        hasMore: false,
      };

      const phaseResult: QueryResult<Phase> = {
        items: [],
        total: 0,
        offset: 0,
        limit: 20,
        hasMore: false,
      };

      expect(requirementResult.items).toEqual([]);
      expect(phaseResult.items).toEqual([]);
    });
  });
});
