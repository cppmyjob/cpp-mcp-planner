import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WEB_SERVER_PORT } from '@mcp-planner/config/client';

import { ArtifactService } from './artifact.service';
import { API_BASE_URL } from './api.service';
import type { Artifact, AddArtifactDto } from '../../../models';

describe('ArtifactService', () => {
  let service: ArtifactService;
  let httpMock: HttpTestingController;
  const baseUrl = `http://localhost:${WEB_SERVER_PORT}/api`;
  const planId = 'plan-1';

  const mockArtifact: Artifact = {
    id: 'art-1',
    type: 'artifact',
    title: 'Test Artifact',
    description: 'Test description',
    artifactType: 'code',
    status: 'draft',
    content: { language: 'typescript', sourceCode: 'const x = 1;' },
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
        ArtifactService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(ArtifactService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('list', () => {
    it('should fetch artifacts for plan', () => {
      service.list(planId).subscribe(artifacts => {
        expect(artifacts).toEqual([mockArtifact]);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts`);
      expect(req.request.method).toBe('GET');
      req.flush({ artifacts: [mockArtifact], total: 1, hasMore: false });
    });

    it('should filter by artifactType', () => {
      service.list(planId, { artifactType: 'code' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts?artifactType=code`);
      req.flush({ artifacts: [], total: 0, hasMore: false });
    });
  });

  describe('get', () => {
    it('should fetch single artifact', () => {
      service.get(planId, 'art-1').subscribe(artifact => {
        expect(artifact).toEqual(mockArtifact);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts/art-1`);
      expect(req.request.method).toBe('GET');
      req.flush({ artifact: mockArtifact });
    });

    it('should include content when requested', () => {
      service.get(planId, 'art-1', { includeContent: true }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts/art-1?includeContent=true`);
      req.flush({ artifact: mockArtifact });
    });
  });

  describe('add', () => {
    it('should add new artifact', () => {
      const addDto: AddArtifactDto = {
        title: 'New Artifact',
        artifactType: 'code'
      };

      service.add(planId, addDto).subscribe(artifact => {
        expect(artifact.title).toBe(addDto.title);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts`);
      expect(req.request.method).toBe('POST');
      req.flush({ ...mockArtifact, ...addDto });
    });
  });

  describe('update', () => {
    it('should update artifact', () => {
      const updates = { title: 'Updated Title' };

      service.update(planId, 'art-1', updates).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts/art-1`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ ...mockArtifact, ...updates });
    });
  });

  describe('delete', () => {
    it('should delete artifact', () => {
      service.delete(planId, 'art-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts/art-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('getHistory', () => {
    it('should fetch artifact history', () => {
      service.getHistory(planId, 'art-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/artifacts/art-1/history`);
      expect(req.request.method).toBe('GET');
      req.flush({ entityId: 'art-1', versions: [], total: 0, currentVersion: 1 });
    });
  });
});
