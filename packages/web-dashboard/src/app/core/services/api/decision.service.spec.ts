import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { DecisionService } from './decision.service';
import { API_BASE_URL } from './api.service';
import type { Decision, CreateDecisionDto } from '../models';

describe('DecisionService', () => {
  let service: DecisionService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000/api';
  const planId = 'plan-1';

  const mockDecision: Decision = {
    id: 'dec-1',
    type: 'decision',
    title: 'Test Decision',
    question: 'Should we use X?',
    context: 'Context here',
    decision: 'Yes, we should use X',
    alternativesConsidered: [],
    status: 'active',
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
        DecisionService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(DecisionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('should fetch decisions for plan', () => {
      service.list(planId).subscribe(decisions => {
        expect(decisions).toEqual([mockDecision]);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions`);
      expect(req.request.method).toBe('GET');
      req.flush([mockDecision]);
    });

    it('should filter by status', () => {
      service.list(planId, { status: 'active' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions?status=active`);
      req.flush([]);
    });
  });

  describe('get', () => {
    it('should fetch single decision', () => {
      service.get(planId, 'dec-1').subscribe(decision => {
        expect(decision).toEqual(mockDecision);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions/dec-1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockDecision);
    });
  });

  describe('create', () => {
    it('should create new decision', () => {
      const createDto: CreateDecisionDto = {
        title: 'New Decision',
        question: 'What should we do?',
        decision: 'We should do X'
      };

      service.create(planId, createDto).subscribe(decision => {
        expect(decision.title).toBe(createDto.title);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...mockDecision, ...createDto });
    });
  });

  describe('update', () => {
    it('should update decision', () => {
      const updates = { title: 'Updated Title' };

      service.update(planId, 'dec-1', updates).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions/dec-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ...mockDecision, ...updates });
    });
  });

  describe('delete', () => {
    it('should delete decision', () => {
      service.delete(planId, 'dec-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions/dec-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('supersede', () => {
    it('should supersede decision', () => {
      const supersedeDto = {
        newDecision: {
          title: 'New Decision',
          question: 'Updated question?',
          decision: 'New answer'
        },
        reason: 'Requirements changed'
      };

      service.supersede(planId, 'dec-1', supersedeDto).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions/dec-1/supersede`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(supersedeDto);
      req.flush({});
    });
  });

  describe('getHistory', () => {
    it('should fetch decision history', () => {
      service.getHistory(planId, 'dec-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions/dec-1/history`);
      expect(req.request.method).toBe('GET');
      req.flush({ entityId: 'dec-1', versions: [], total: 0, currentVersion: 1 });
    });
  });

  describe('getDiff', () => {
    it('should fetch decision diff', () => {
      service.getDiff(planId, 'dec-1', 1, 2).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/decisions/dec-1/diff?version1=1&version2=2`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  });
});
