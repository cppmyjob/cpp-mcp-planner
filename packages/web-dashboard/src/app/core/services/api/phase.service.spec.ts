import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WEB_SERVER_PORT } from '@mcp-planner/config/client';

import { PhaseService } from './phase.service';
import { API_BASE_URL } from './api.service';
import type { Phase, AddPhaseDto, PhaseTreeNode } from '../../../models';

describe('PhaseService', () => {
  let service: PhaseService;
  let httpMock: HttpTestingController;
  const baseUrl = `http://localhost:${WEB_SERVER_PORT}/api`;
  const planId = 'plan-1';

  const mockPhase: Phase = {
    id: 'phase-1',
    type: 'phase',
    title: 'Test Phase',
    description: 'Test description',
    parentId: null,
    order: 1,
    depth: 0,
    path: '1',
    objectives: [],
    deliverables: [],
    successCriteria: [],
    schedule: {
      estimatedEffort: { value: 5, unit: 'days', confidence: 'medium' }
    },
    status: 'planned',
    progress: 0,
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
        PhaseService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(PhaseService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('should fetch phases for plan', () => {
      service.list(planId).subscribe(phases => {
        expect(phases).toEqual([mockPhase]);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases`);
      expect(req.request.method).toBe('GET');
      req.flush({ phases: [mockPhase] });
    });
  });

  describe('getTree', () => {
    it('should fetch phase tree', () => {
      const mockTree: PhaseTreeNode[] = [{
        phase: mockPhase,
        children: [],
        depth: 0,
        hasChildren: false
      }];

      service.getTree(planId).subscribe(tree => {
        expect(tree).toEqual(mockTree);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/tree`);
      expect(req.request.method).toBe('GET');
      req.flush({ tree: mockTree });
    });

    it('should respect maxDepth parameter', () => {
      service.getTree(planId, { maxDepth: 2 }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/tree?maxDepth=2`);
      req.flush({ tree: [] });
    });
  });

  describe('get', () => {
    it('should fetch single phase', () => {
      service.get(planId, 'phase-1').subscribe(phase => {
        expect(phase).toEqual(mockPhase);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/phase-1`);
      expect(req.request.method).toBe('GET');
      req.flush(mockPhase);
    });
  });

  describe('add', () => {
    it('should add new phase', () => {
      const addDto: AddPhaseDto = {
        title: 'New Phase',
        description: 'New description'
      };

      service.add(planId, addDto).subscribe(phase => {
        expect(phase.title).toBe(addDto.title);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...mockPhase, ...addDto });
    });

    it('should add child phase', () => {
      const addDto: AddPhaseDto = {
        title: 'Child Phase',
        parentId: 'phase-1'
      };

      service.add(planId, addDto).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases`);
      expect(req.request.body.parentId).toBe('phase-1');
      req.flush({ ...mockPhase, ...addDto, depth: 1, path: '1.1' });
    });
  });

  describe('update', () => {
    it('should update phase', () => {
      const updates = { title: 'Updated Title' };

      service.update(planId, 'phase-1', updates).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/phase-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ...mockPhase, ...updates });
    });
  });

  describe('updateStatus', () => {
    it('should update phase status', () => {
      service.updateStatus(planId, 'phase-1', { status: 'in_progress' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/phase-1/status`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('in_progress');
      req.flush({});
    });

    it('should update status with progress', () => {
      service.updateStatus(planId, 'phase-1', { status: 'in_progress', progress: 50 }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/phase-1/status`);
      expect(req.request.body.progress).toBe(50);
      req.flush({});
    });
  });

  describe('move', () => {
    it('should move phase to new parent', () => {
      service.move(planId, 'phase-1', { newParentId: 'phase-2' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/phase-1/move`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.newParentId).toBe('phase-2');
      req.flush({});
    });
  });

  describe('delete', () => {
    it('should delete phase', () => {
      service.delete(planId, 'phase-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/phase-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('getNextActions', () => {
    it('should fetch next actions', () => {
      service.getNextActions(planId).subscribe(actions => {
        expect(actions).toEqual([]);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/next-actions`);
      expect(req.request.method).toBe('GET');
      req.flush([]);
    });
  });

  describe('completeAndAdvance', () => {
    it('should complete phase and advance', () => {
      service.completeAndAdvance(planId, 'phase-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/phases/phase-1/complete`);
      expect(req.request.method).toBe('POST');
      req.flush({});
    });
  });
});
