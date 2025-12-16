import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { SolutionService } from './solution.service';
import { API_BASE_URL } from './api.service';
import type { Solution, CreateSolutionDto } from '../models';

describe('SolutionService', () => {
  let service: SolutionService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000/api';
  const planId = 'plan-1';

  const mockSolution: Solution = {
    id: 'sol-1',
    type: 'solution',
    title: 'Test Solution',
    description: 'Test description',
    approach: 'Test approach',
    tradeoffs: [],
    addressing: ['req-1'],
    evaluation: {
      effortEstimate: { value: 5, unit: 'days', confidence: 'medium' },
      technicalFeasibility: 'high',
      riskAssessment: 'Low risk'
    },
    status: 'proposed',
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
        SolutionService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(SolutionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('should fetch solutions for plan', () => {
      service.list(planId).subscribe(solutions => {
        expect(solutions).toEqual([mockSolution]);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions`);
      expect(req.request.method).toBe('GET');
      req.flush([mockSolution]);
    });

    it('should filter by status', () => {
      service.list(planId, { status: 'selected' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions?status=selected`);
      req.flush([]);
    });
  });

  describe('get', () => {
    it('should fetch single solution', () => {
      service.get(planId, 'sol-1').subscribe(solution => {
        expect(solution).toEqual(mockSolution);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions/sol-1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockSolution);
    });
  });

  describe('create', () => {
    it('should create new solution', () => {
      const createDto: CreateSolutionDto = {
        title: 'New Solution',
        addressing: ['req-1']
      };

      service.create(planId, createDto).subscribe(solution => {
        expect(solution.title).toBe(createDto.title);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...mockSolution, ...createDto });
    });
  });

  describe('update', () => {
    it('should update solution', () => {
      const updates = { title: 'Updated Title' };

      service.update(planId, 'sol-1', updates).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions/sol-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ...mockSolution, ...updates });
    });
  });

  describe('delete', () => {
    it('should delete solution', () => {
      service.delete(planId, 'sol-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions/sol-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('select', () => {
    it('should select solution', () => {
      service.select(planId, 'sol-1', { reason: 'Best fit' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions/sol-1/select`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.reason).toBe('Best fit');
      req.flush({});
    });

    it('should select with decision record', () => {
      service.select(planId, 'sol-1', { reason: 'Best fit', createDecisionRecord: true }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions/sol-1/select`);
      expect(req.request.body.createDecisionRecord).toBe(true);
      req.flush({});
    });
  });

  describe('compare', () => {
    it('should compare solutions', () => {
      const solutionIds = ['sol-1', 'sol-2'];

      service.compare(planId, solutionIds).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions/compare`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.solutionIds).toEqual(solutionIds);
      req.flush({});
    });
  });

  describe('getHistory', () => {
    it('should fetch solution history', () => {
      service.getHistory(planId, 'sol-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/solutions/sol-1/history`);
      expect(req.request.method).toBe('GET');
      req.flush({ entityId: 'sol-1', versions: [], total: 0, currentVersion: 1 });
    });
  });
});
