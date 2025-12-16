import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PlanService } from './plan.service';
import { API_BASE_URL } from './api.service';
import type { PlanManifest, CreatePlanDto } from '../models';

describe('PlanService', () => {
  let service: PlanService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000/api';

  const mockPlan: PlanManifest = {
    id: 'plan-1',
    name: 'Test Plan',
    description: 'Test description',
    status: 'active',
    author: 'test-user',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    version: 1,
    lockVersion: 1,
    statistics: {
      totalRequirements: 0,
      totalSolutions: 0,
      totalDecisions: 0,
      totalPhases: 0,
      totalArtifacts: 0,
      completionPercentage: 0
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        PlanService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(PlanService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('should fetch all plans', () => {
      const mockPlans = [mockPlan];

      service.list().subscribe(plans => {
        expect(plans).toEqual(mockPlans);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans`);
      expect(req.request.method).toBe('GET');
      req.flush(mockPlans);
    });

    it('should filter by status', () => {
      service.list({ status: 'active' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans?status=active`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('get', () => {
    it('should fetch single plan by id', () => {
      service.get('plan-1').subscribe(plan => {
        expect(plan).toEqual(mockPlan);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/plan-1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockPlan);
    });
  });

  describe('create', () => {
    it('should create new plan', () => {
      const createDto: CreatePlanDto = {
        name: 'New Plan',
        description: 'New description'
      };

      service.create(createDto).subscribe(plan => {
        expect(plan.name).toBe(createDto.name);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(createDto);
      req.flush({ ...mockPlan, ...createDto });
    });
  });

  describe('update', () => {
    it('should update existing plan', () => {
      const updates = { name: 'Updated Name' };

      service.update('plan-1', updates).subscribe(plan => {
        expect(plan.name).toBe(updates.name);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/plan-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ...mockPlan, ...updates });
    });
  });

  describe('delete', () => {
    it('should delete plan', () => {
      service.delete('plan-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/plan-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('getSummary', () => {
    it('should fetch plan summary', () => {
      const mockSummary = { plan: mockPlan, statistics: mockPlan.statistics };

      service.getSummary('plan-1').subscribe(summary => {
        expect(summary.plan).toEqual(mockPlan);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/plan-1/summary`);
      expect(req.request.method).toBe('GET');
      req.flush(mockSummary);
    });
  });

  describe('activate', () => {
    it('should activate plan for workspace', () => {
      service.activate('plan-1', '/workspace/path').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/plan-1/activate`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ workspacePath: '/workspace/path' });
      req.flush({});
    });
  });

  describe('getActive', () => {
    it('should get active plan for workspace', () => {
      service.getActive('/workspace/path').subscribe(plan => {
        expect(plan).toEqual(mockPlan);
      });

      const req = httpMock.expectOne(
        (request) => request.url === `${baseUrl}/plans/active` &&
                     request.params.get('workspacePath') === '/workspace/path'
      );
      expect(req.request.method).toBe('GET');
      req.flush(mockPlan);
    });
  });
});
