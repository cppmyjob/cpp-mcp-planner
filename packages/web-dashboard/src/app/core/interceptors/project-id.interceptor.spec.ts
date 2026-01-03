/**
 * GREEN: Phase 4.3 - Tests for projectIdInterceptor
 */

import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { signal } from '@angular/core';
import { projectIdInterceptor } from './project-id.interceptor';
import { ProjectStateService } from '../services';

describe('projectIdInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let projectState: ProjectStateService;
  let activeProjectIdSignal: ReturnType<typeof signal<string | null>>;

  beforeEach(() => {
    // Create a signal for mocking activeProjectId
    activeProjectIdSignal = signal<string | null>(null);

    // Mock ProjectStateService
    const mockProjectStateService = {
      activeProjectId: () => activeProjectIdSignal()
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([projectIdInterceptor])),
        provideHttpClientTesting(),
        { provide: ProjectStateService, useValue: mockProjectStateService }
      ]
    });

    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    projectState = TestBed.inject(ProjectStateService);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('header injection', () => {
    it('should add X-Project-Id header when activeProjectId is not null', () => {
      // Arrange
      const projectId = 'test-project-123';
      activeProjectIdSignal.set(projectId);

      // Act
      httpClient.get('/api/test').subscribe();

      // Assert
      const req = httpMock.expectOne('/api/test');
      expect(req.request.headers.has('X-Project-Id')).toBe(true);
      expect(req.request.headers.get('X-Project-Id')).toBe(projectId);
      req.flush({});
    });

    it('should NOT add X-Project-Id header when activeProjectId is null', () => {
      // Arrange
      activeProjectIdSignal.set(null);

      // Act
      httpClient.get('/api/test').subscribe();

      // Assert
      const req = httpMock.expectOne('/api/test');
      expect(req.request.headers.has('X-Project-Id')).toBe(false);
      req.flush({});
    });

    it('should add different project IDs for different requests', () => {
      // Arrange
      const projectId1 = 'project-1';
      const projectId2 = 'project-2';

      // Act & Assert - First request
      activeProjectIdSignal.set(projectId1);
      httpClient.get('/api/first').subscribe();

      const req1 = httpMock.expectOne('/api/first');
      expect(req1.request.headers.get('X-Project-Id')).toBe(projectId1);
      req1.flush({});

      // Act & Assert - Second request with different project ID
      activeProjectIdSignal.set(projectId2);
      httpClient.get('/api/second').subscribe();

      const req2 = httpMock.expectOne('/api/second');
      expect(req2.request.headers.get('X-Project-Id')).toBe(projectId2);
      req2.flush({});
    });

    it('should handle transition from null to non-null project ID', () => {
      // Arrange - Start with null
      activeProjectIdSignal.set(null);

      // Act & Assert - First request (no header)
      httpClient.get('/api/first').subscribe();

      const req1 = httpMock.expectOne('/api/first');
      expect(req1.request.headers.has('X-Project-Id')).toBe(false);
      req1.flush({});

      // Act & Assert - Second request (with header)
      const projectId = 'new-project';
      activeProjectIdSignal.set(projectId);
      httpClient.get('/api/second').subscribe();

      const req2 = httpMock.expectOne('/api/second');
      expect(req2.request.headers.get('X-Project-Id')).toBe(projectId);
      req2.flush({});
    });

    it('should handle transition from non-null to null project ID', () => {
      // Arrange - Start with project ID
      const projectId = 'temp-project';
      activeProjectIdSignal.set(projectId);

      // Act & Assert - First request (with header)
      httpClient.get('/api/first').subscribe();

      const req1 = httpMock.expectOne('/api/first');
      expect(req1.request.headers.get('X-Project-Id')).toBe(projectId);
      req1.flush({});

      // Act & Assert - Second request (no header)
      activeProjectIdSignal.set(null);
      httpClient.get('/api/second').subscribe();

      const req2 = httpMock.expectOne('/api/second');
      expect(req2.request.headers.has('X-Project-Id')).toBe(false);
      req2.flush({});
    });
  });

  describe('HTTP methods', () => {
    it('should add header to GET requests', () => {
      // Arrange
      const projectId = 'test-project';
      activeProjectIdSignal.set(projectId);

      // Act
      httpClient.get('/api/data').subscribe();

      // Assert
      const req = httpMock.expectOne('/api/data');
      expect(req.request.method).toBe('GET');
      expect(req.request.headers.get('X-Project-Id')).toBe(projectId);
      req.flush({});
    });

    it('should add header to POST requests', () => {
      // Arrange
      const projectId = 'test-project';
      activeProjectIdSignal.set(projectId);

      // Act
      httpClient.post('/api/data', { test: 'data' }).subscribe();

      // Assert
      const req = httpMock.expectOne('/api/data');
      expect(req.request.method).toBe('POST');
      expect(req.request.headers.get('X-Project-Id')).toBe(projectId);
      req.flush({});
    });

    it('should add header to PUT requests', () => {
      // Arrange
      const projectId = 'test-project';
      activeProjectIdSignal.set(projectId);

      // Act
      httpClient.put('/api/data/123', { test: 'data' }).subscribe();

      // Assert
      const req = httpMock.expectOne('/api/data/123');
      expect(req.request.method).toBe('PUT');
      expect(req.request.headers.get('X-Project-Id')).toBe(projectId);
      req.flush({});
    });

    it('should add header to DELETE requests', () => {
      // Arrange
      const projectId = 'test-project';
      activeProjectIdSignal.set(projectId);

      // Act
      httpClient.delete('/api/data/123').subscribe();

      // Assert
      const req = httpMock.expectOne('/api/data/123');
      expect(req.request.method).toBe('DELETE');
      expect(req.request.headers.get('X-Project-Id')).toBe(projectId);
      req.flush({});
    });
  });

  describe('header preservation', () => {
    it('should preserve existing headers when adding X-Project-Id', () => {
      // Arrange
      const projectId = 'test-project';
      activeProjectIdSignal.set(projectId);

      // Act
      httpClient.get('/api/test', {
        headers: {
          'Authorization': 'Bearer token123',
          'Content-Type': 'application/json'
        }
      }).subscribe();

      // Assert
      const req = httpMock.expectOne('/api/test');
      expect(req.request.headers.get('X-Project-Id')).toBe(projectId);
      expect(req.request.headers.get('Authorization')).toBe('Bearer token123');
      expect(req.request.headers.get('Content-Type')).toBe('application/json');
      req.flush({});
    });

    it('should not add header when activeProjectId is null, preserving other headers', () => {
      // Arrange
      activeProjectIdSignal.set(null);

      // Act
      httpClient.get('/api/test', {
        headers: {
          'Authorization': 'Bearer token456'
        }
      }).subscribe();

      // Assert
      const req = httpMock.expectOne('/api/test');
      expect(req.request.headers.has('X-Project-Id')).toBe(false);
      expect(req.request.headers.get('Authorization')).toBe('Bearer token456');
      req.flush({});
    });
  });
});
