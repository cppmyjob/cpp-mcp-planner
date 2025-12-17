import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ApiService, API_BASE_URL } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000/api';

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ApiService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('GET requests', () => {
    it('should perform GET request', () => {
      const mockData = { id: '1', name: 'Test' };

      service.get<typeof mockData>('/test').subscribe(data => {
        expect(data).toEqual(mockData);
      });

      const req = httpMock.expectOne(`${baseUrl}/test`);
      expect(req.request.method).toBe('GET');
      req.flush(mockData);
    });

    it('should handle query parameters', () => {
      service.get('/test', { status: 'active', limit: 10 }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/test?status=active&limit=10`);
      expect(req.request.method).toBe('GET');
      req.flush({});
    });
  });

  describe('POST requests', () => {
    it('should perform POST request with body', () => {
      const body = { name: 'New Item' };
      const mockResponse = { id: '1', ...body };

      service.post<typeof mockResponse>('/items', body).subscribe(data => {
        expect(data).toEqual(mockResponse);
      });

      const req = httpMock.expectOne(`${baseUrl}/items`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush(mockResponse);
    });
  });

  describe('PATCH requests', () => {
    it('should perform PATCH request', () => {
      const body = { name: 'Updated' };

      service.patch('/items/1', body).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/items/1`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(body);
      req.flush({});
    });
  });

  describe('DELETE requests', () => {
    it('should perform DELETE request', () => {
      service.delete('/items/1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/items/1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });

  describe('Error handling', () => {
    it('should handle HTTP errors', () => {
      service.get('/not-found').subscribe({
        error: (error) => {
          expect(error.status).toBe(404);
        }
      });

      const req = httpMock.expectOne(`${baseUrl}/not-found`);
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });
    });
  });
});
