import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { WEB_SERVER_PORT } from '@mcp-planner/config/client';
import { SidebarComponent } from './sidebar';
import { API_BASE_URL } from '../../core/services/api/api.service';
import type { PlanManifest } from '../../models';

// Host component to test input binding
@Component({
  selector: 'app-test-host',
  imports: [SidebarComponent],
  template: `<app-sidebar [collapsed]="isCollapsed" [selectedPlanId]="selectedId" />`
})
class TestHostComponent {
  public isCollapsed = false;
  public selectedId = '';
}

describe('SidebarComponent', () => {
  let httpMock: HttpTestingController;
  const baseUrl = `http://localhost:${WEB_SERVER_PORT}/api`;

  const mockPlans: PlanManifest[] = [
    {
      id: 'plan-1',
      name: 'Project Alpha',
      description: 'First project',
      status: 'active',
      author: 'test-user',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      version: 1,
      lockVersion: 1,
      statistics: {
        totalRequirements: 5,
        totalSolutions: 2,
        totalDecisions: 1,
        totalPhases: 10,
        totalArtifacts: 3,
        completionPercentage: 45
      }
    },
    {
      id: 'plan-2',
      name: 'Project Beta',
      description: 'Second project',
      status: 'active',
      author: 'test-user',
      createdAt: '2025-01-02T00:00:00Z',
      updatedAt: '2025-01-02T00:00:00Z',
      version: 1,
      lockVersion: 1,
      statistics: {
        totalRequirements: 3,
        totalSolutions: 1,
        totalDecisions: 0,
        totalPhases: 5,
        totalArtifacts: 1,
        completionPercentage: 20
      }
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidebarComponent, TestHostComponent],
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

  it('should create', () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();

    // Flush pending requests
    httpMock.match(() => true).forEach(req => req.flush({ plans: [], total: 0, hasMore: false }));
  });

  it('should load plans on init', async () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne(`${baseUrl}/plans`);
    expect(req.request.method).toBe('GET');
    req.flush({ plans: mockPlans, total: mockPlans.length, hasMore: false });

    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    expect(component.plans().length).toBe(2);
  });

  it('should display plans in sidebar menu', async () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne(`${baseUrl}/plans`);
    req.flush({ plans: mockPlans, total: mockPlans.length, hasMore: false });

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Project Alpha');
    expect(compiled.textContent).toContain('Project Beta');
  });

  it('should have navigation menu items', async () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne(`${baseUrl}/plans`);
    req.flush({ plans: mockPlans, total: mockPlans.length, hasMore: false });

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Should have main navigation items
    expect(compiled.textContent).toContain('Dashboard');
    expect(compiled.textContent).toContain('Requirements');
    expect(compiled.textContent).toContain('Solutions');
    expect(compiled.textContent).toContain('Decisions');
    expect(compiled.textContent).toContain('Phases');
    expect(compiled.textContent).toContain('Artifacts');
  });

  it('should emit planSelected when plan is clicked', async () => {
    const fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();

    const req = httpMock.expectOne(`${baseUrl}/plans`);
    req.flush({ plans: mockPlans, total: mockPlans.length, hasMore: false });

    await fixture.whenStable();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    const spy = vi.spyOn(component.planSelected, 'emit');

    // Click on first plan
    const planItems = fixture.nativeElement.querySelectorAll('[data-testid="plan-item"]');
    planItems[0]?.click();

    expect(spy).toHaveBeenCalledWith(mockPlans[0]);
  });

  it('should highlight selected plan', async () => {
    const fixture: ComponentFixture<TestHostComponent> = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.selectedId = 'plan-1';
    fixture.detectChanges();

    const req = httpMock.expectOne(`${baseUrl}/plans`);
    req.flush({ plans: mockPlans, total: mockPlans.length, hasMore: false });

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const selectedItem = compiled.querySelector('.plan-item--selected, [data-selected="true"]');
    expect(selectedItem).toBeTruthy();
  });

  it('should show collapsed state when collapsed input is true', () => {
    const fixture: ComponentFixture<TestHostComponent> = TestBed.createComponent(TestHostComponent);
    fixture.componentInstance.isCollapsed = true;
    fixture.detectChanges();

    httpMock.match(() => true).forEach(req => req.flush({ plans: [], total: 0, hasMore: false }));

    const compiled = fixture.nativeElement as HTMLElement;
    const sidebar = compiled.querySelector('.sidebar');
    expect(sidebar?.classList.contains('sidebar--collapsed')).toBe(true);
  });
});
