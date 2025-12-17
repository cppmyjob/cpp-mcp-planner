import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { RequirementService } from './requirement.service';
import { API_BASE_URL } from './api.service';
import type { Requirement, CreateRequirementDto } from '../../../models';

describe('RequirementService', () => {
  let service: RequirementService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000/api';
  const planId = 'plan-1';

  const mockRequirement: Requirement = {
    id: 'req-1',
    type: 'requirement',
    title: 'Test Requirement',
    description: 'Test description',
    source: { type: 'user-request' },
    acceptanceCriteria: ['Criteria 1'],
    priority: 'high',
    category: 'functional',
    status: 'draft',
    votes: 0,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    version: 1,
    metadata: { createdBy: 'test', tags: [], annotations: [] }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        RequirementService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(RequirementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('should fetch requirements for plan', () => {
      service.list(planId).subscribe(requirements => {
        expect(requirements).toEqual([mockRequirement]);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements`);
      expect(req.request.method).toBe('GET');
      req.flush({ requirements: [mockRequirement], total: 1, hasMore: false });
    });

    it('should filter by status', () => {
      service.list(planId, { status: 'approved' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements?status=approved`);
      req.flush({ requirements: [], total: 0, hasMore: false });
    });

    it('should filter by priority', () => {
      service.list(planId, { priority: 'critical' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements?priority=critical`);
      req.flush({ requirements: [], total: 0, hasMore: false });
    });
  });

  describe('get', () => {
    it('should fetch single requirement', () => {
      service.get(planId, 'req-1').subscribe(requirement => {
        expect(requirement).toEqual(mockRequirement);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements/req-1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockRequirement);
    });
  });

  describe('create', () => {
    it('should create new requirement', () => {
      const createDto: CreateRequirementDto = {
        title: 'New Requirement',
        source: { type: 'user-request' }
      };

      service.create(planId, createDto).subscribe(requirement => {
        expect(requirement.title).toBe(createDto.title);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...mockRequirement, ...createDto });
    });
  });

  describe('update', () => {
    it('should update requirement', () => {
      const updates = { title: 'Updated Title' };

      service.update(planId, 'req-1', updates).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements/req-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ...mockRequirement, ...updates });
    });
  });

  describe('delete', () => {
    it('should delete requirement', () => {
      service.delete(planId, 'req-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements/req-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('vote', () => {
    it('should vote for requirement', () => {
      service.vote(planId, 'req-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements/req-1/vote`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('unvote', () => {
    it('should unvote requirement', () => {
      service.unvote(planId, 'req-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements/req-1/unvote`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });

  describe('getHistory', () => {
    it('should fetch requirement history', () => {
      const mockHistory = { entityId: 'req-1', versions: [], total: 0, currentVersion: 1 };

      service.getHistory(planId, 'req-1').subscribe(history => {
        expect(history.entityId).toBe('req-1');
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/requirements/req-1/history`);
      expect(req.request.method).toBe('GET');
      req.flush(mockHistory);
    });
  });
});
