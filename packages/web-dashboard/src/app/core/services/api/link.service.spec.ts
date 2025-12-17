import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { LinkService } from './link.service';
import { API_BASE_URL } from './api.service';
import type { Link, CreateLinkDto } from '../../../models';

describe('LinkService', () => {
  let service: LinkService;
  let httpMock: HttpTestingController;
  const baseUrl = 'http://localhost:3000/api';
  const planId = 'plan-1';

  const mockLink: Link = {
    id: 'link-1',
    sourceId: 'sol-1',
    targetId: 'req-1',
    relationType: 'implements',
    createdAt: '2025-01-01T00:00:00Z',
    createdBy: 'test'
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        LinkService,
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    });

    service = TestBed.inject(LinkService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('getForEntity', () => {
    it('should fetch links for entity', () => {
      service.getForEntity(planId, 'sol-1').subscribe(links => {
        expect(links).toEqual([mockLink]);
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/links?entityId=sol-1`);
      expect(req.request.method).toBe('GET');
      req.flush([mockLink]);
    });

    it('should filter by direction', () => {
      service.getForEntity(planId, 'sol-1', { direction: 'outgoing' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/links?entityId=sol-1&direction=outgoing`);
      req.flush([]);
    });

    it('should filter by relationType', () => {
      service.getForEntity(planId, 'sol-1', { relationType: 'implements' }).subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/links?entityId=sol-1&relationType=implements`);
      req.flush([]);
    });
  });

  describe('create', () => {
    it('should create new link', () => {
      const createDto: CreateLinkDto = {
        sourceId: 'sol-1',
        targetId: 'req-1',
        relationType: 'implements'
      };

      service.create(planId, createDto).subscribe(link => {
        expect(link.relationType).toBe('implements');
      });

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/links`);
      expect(req.request.method).toBe('POST');
      req.flush(mockLink);
    });
  });

  describe('delete', () => {
    it('should delete link', () => {
      service.delete(planId, 'link-1').subscribe();

      const req = httpMock.expectOne(`${baseUrl}/plans/${planId}/links/link-1`);
      expect(req.request.method).toBe('DELETE');
      req.flush({});
    });
  });
});
