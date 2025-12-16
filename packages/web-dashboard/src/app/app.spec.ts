import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app';
import { API_BASE_URL } from './services/api.service';
import type { PlanManifest, Requirement } from './models';

// Mock window.matchMedia for ThemeService
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

describe('AppComponent', () => {
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
      totalRequirements: 2,
      totalSolutions: 0,
      totalDecisions: 0,
      totalPhases: 0,
      totalArtifacts: 0,
      completionPercentage: 0
    }
  };

  const mockRequirements: Requirement[] = [
    {
      id: 'req-1',
      type: 'requirement',
      title: 'User Authentication',
      description: 'Implement user login',
      priority: 'high',
      category: 'functional',
      status: 'approved',
      votes: 5,
      source: { type: 'user-request' },
      acceptanceCriteria: ['Users can login'],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      version: 1,
      metadata: { createdBy: 'test-user', tags: [], annotations: [] }
    },
    {
      id: 'req-2',
      type: 'requirement',
      title: 'Dashboard Display',
      description: 'Show main dashboard',
      priority: 'medium',
      category: 'functional',
      status: 'draft',
      votes: 2,
      source: { type: 'discovered' },
      acceptanceCriteria: ['Dashboard loads'],
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      version: 1,
      metadata: { createdBy: 'test-user', tags: [], annotations: [] }
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_BASE_URL, useValue: baseUrl }
      ]
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();

    // Flush any pending requests
    httpMock.match(() => true).forEach(req => req.flush([]));
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    // Handle plans request
    const plansReq = httpMock.expectOne(`${baseUrl}/plans`);
    plansReq.flush([mockPlan]);

    await fixture.whenStable();

    // Handle requirements request
    const reqsReq = httpMock.expectOne(`${baseUrl}/plans/plan-1/requirements`);
    reqsReq.flush(mockRequirements);

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('MCP Planning Dashboard');
  });

  describe('Requirements Display', () => {
    it('should load plans on init', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const plansReq = httpMock.expectOne(`${baseUrl}/plans`);
      expect(plansReq.request.method).toBe('GET');
      plansReq.flush([mockPlan]);

      await fixture.whenStable();

      // Handle requirements request
      const reqsReq = httpMock.expectOne(`${baseUrl}/plans/plan-1/requirements`);
      reqsReq.flush(mockRequirements);

      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('should load requirements when plan is selected', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      // First, plans are loaded
      const plansReq = httpMock.expectOne(`${baseUrl}/plans`);
      plansReq.flush([mockPlan]);

      await fixture.whenStable();

      // Then requirements are loaded for first plan
      const reqsReq = httpMock.expectOne(`${baseUrl}/plans/plan-1/requirements`);
      expect(reqsReq.request.method).toBe('GET');
      reqsReq.flush(mockRequirements);

      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('should display requirements in table', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const plansReq = httpMock.expectOne(`${baseUrl}/plans`);
      plansReq.flush([mockPlan]);

      await fixture.whenStable();

      const reqsReq = httpMock.expectOne(`${baseUrl}/plans/plan-1/requirements`);
      reqsReq.flush(mockRequirements);

      await fixture.whenStable();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // Should show requirements table
      const table = compiled.querySelector('p-table, table');
      expect(table).toBeTruthy();

      // Should display requirement titles
      expect(compiled.textContent).toContain('User Authentication');
      expect(compiled.textContent).toContain('Dashboard Display');
    });

    it('should show loading state while fetching data', () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // Should show loading indicator before data arrives
      const loadingIndicator = compiled.querySelector('.loading, p-progressSpinner, [data-testid="loading"]');
      expect(loadingIndicator).toBeTruthy();

      // Complete the requests to cleanup
      httpMock.match(() => true).forEach(req => req.flush([]));
    });

    it('should show error message when API fails', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const plansReq = httpMock.expectOne(`${baseUrl}/plans`);
      plansReq.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });

      await fixture.whenStable();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // Should show error message
      const errorElement = compiled.querySelector('.error, p-message, [data-testid="error"]');
      expect(errorElement).toBeTruthy();
    });

    it('should show empty state when no requirements', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const plansReq = httpMock.expectOne(`${baseUrl}/plans`);
      plansReq.flush([mockPlan]);

      await fixture.whenStable();

      const reqsReq = httpMock.expectOne(`${baseUrl}/plans/plan-1/requirements`);
      reqsReq.flush([]);

      await fixture.whenStable();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // Should show empty state message
      expect(compiled.textContent).toContain('No requirements');
    });

    it('should display requirement priority with correct styling', async () => {
      const fixture = TestBed.createComponent(AppComponent);
      fixture.detectChanges();

      const plansReq = httpMock.expectOne(`${baseUrl}/plans`);
      plansReq.flush([mockPlan]);

      await fixture.whenStable();

      const reqsReq = httpMock.expectOne(`${baseUrl}/plans/plan-1/requirements`);
      reqsReq.flush(mockRequirements);

      await fixture.whenStable();
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;

      // Should display priority badges
      const priorityBadges = compiled.querySelectorAll('p-tag, .priority-badge, [data-testid="priority"]');
      expect(priorityBadges.length).toBeGreaterThan(0);
    });
  });
});
