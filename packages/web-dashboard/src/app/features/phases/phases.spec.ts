import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { PhasesComponent } from './phases';
import { PhaseService, PlanStateService } from '../../core/services';
import type { PhaseTreeNode, Phase } from '../../models';

// Mock data
const mockPhaseTree: PhaseTreeNode[] = [
  {
    phase: {
      id: 'phase-1',
      type: 'phase',
      title: 'Sprint 1',
      description: 'First sprint',
      parentId: null,
      order: 1,
      depth: 0,
      path: '1',
      objectives: [],
      deliverables: [],
      successCriteria: [],
      schedule: { estimatedEffort: { value: 1, unit: 'weeks', confidence: 'medium' } },
      status: 'in_progress',
      progress: 50,
      priority: 'high',
      createdAt: '2025-01-01',
      updatedAt: '2025-01-01',
      version: 1,
      metadata: { createdBy: 'test', tags: [], annotations: [] }
    } as Phase,
    children: [
      {
        phase: {
          id: 'phase-1-1',
          type: 'phase',
          title: 'Task 1.1',
          description: 'First task',
          parentId: 'phase-1',
          order: 1,
          depth: 1,
          path: '1.1',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          schedule: { estimatedEffort: { value: 2, unit: 'days', confidence: 'high' } },
          status: 'completed',
          progress: 100,
          priority: 'medium',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
          version: 1,
          metadata: { createdBy: 'test', tags: [], annotations: [] }
        } as Phase,
        children: [],
        depth: 1,
        hasChildren: false
      },
      {
        phase: {
          id: 'phase-1-2',
          type: 'phase',
          title: 'Task 1.2',
          description: 'Second task - blocked',
          parentId: 'phase-1',
          order: 2,
          depth: 1,
          path: '1.2',
          objectives: [],
          deliverables: [],
          successCriteria: [],
          schedule: { estimatedEffort: { value: 3, unit: 'days', confidence: 'low' } },
          status: 'blocked',
          progress: 25,
          priority: 'critical',
          blockingReason: 'Waiting for API',
          createdAt: '2025-01-01',
          updatedAt: '2025-01-01',
          version: 1,
          metadata: { createdBy: 'test', tags: [], annotations: [] }
        } as Phase,
        children: [],
        depth: 1,
        hasChildren: false
      }
    ],
    depth: 0,
    hasChildren: true
  }
];

describe('PhasesComponent', () => {
  let phaseServiceMock: { getTree: ReturnType<typeof vi.fn> };
  const activePlanIdSignal = signal('test-plan-id');
  let planStateServiceMock: { activePlanId: ReturnType<typeof activePlanIdSignal.asReadonly> };

  beforeEach(async () => {
    phaseServiceMock = {
      getTree: vi.fn().mockReturnValue(of(mockPhaseTree))
    };

    activePlanIdSignal.set('test-plan-id');
    planStateServiceMock = {
      activePlanId: activePlanIdSignal.asReadonly()
    };

    await TestBed.configureTestingModule({
      imports: [PhasesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PhaseService, useValue: phaseServiceMock },
        { provide: PlanStateService, useValue: planStateServiceMock }
      ]
    }).compileComponents();
  });

  describe('Component Creation', () => {
    it('should create', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      const component = fixture.componentInstance;
      expect(component).toBeTruthy();
    });

    it('should have data-testid for e2e testing', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('[data-testid="phases-page"]')).toBeTruthy();
    });
  });

  describe('Header & Stats', () => {
    it('should display page title', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.phases__title')?.textContent).toContain('Phase Tree');
    });

    it('should display total phases count', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const totalStat = compiled.querySelector('[data-testid="total-phases"]');
      expect(totalStat?.textContent).toContain('3'); // 1 parent + 2 children
    });

    it('should display completed phases count', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const completedStat = compiled.querySelector('[data-testid="completed-phases"]');
      expect(completedStat?.textContent).toContain('1');
    });

    it('should display in-progress phases count', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const inProgressStat = compiled.querySelector('[data-testid="in-progress-phases"]');
      expect(inProgressStat?.textContent).toContain('1');
    });
  });

  describe('Toolbar', () => {
    it('should have expand/collapse all button', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const toggleBtn = compiled.querySelector('[data-testid="toggle-expand-btn"]');
      expect(toggleBtn).toBeTruthy();
      expect(toggleBtn?.textContent).toContain('Expand All');
    });

    it('should have refresh button', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const refreshBtn = compiled.querySelector('[data-testid="refresh-btn"]');
      expect(refreshBtn).toBeTruthy();
    });

    it('should toggle expand/collapse text on click', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();

      expect(component.allExpanded()).toBe(false);
      component.toggleExpandAll();
      expect(component.allExpanded()).toBe(true);

      const compiled = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      const toggleBtn = compiled.querySelector('[data-testid="toggle-expand-btn"]');
      expect(toggleBtn?.textContent).toContain('Collapse All');
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator initially', () => {
      phaseServiceMock.getTree.mockReturnValue(of(mockPhaseTree));
      const fixture = TestBed.createComponent(PhasesComponent);
      // Don't call detectChanges to keep loading state
      const component = fixture.componentInstance;
      expect(component.loading()).toBe(true);
    });

    it('should hide loading after data loads', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();
      const component = fixture.componentInstance;
      expect(component.loading()).toBe(false);
    });
  });

  describe('Error State', () => {
    it('should display error message on API failure', () => {
      phaseServiceMock.getTree.mockReturnValue(throwError(() => new Error('Network error')));
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      expect(component.error()).toBe('Network error');

      const compiled = fixture.nativeElement as HTMLElement;
      const errorEl = compiled.querySelector('[data-testid="error-message"]');
      expect(errorEl).toBeTruthy();
      expect(errorEl?.textContent).toContain('Network error');
    });
  });

  describe('Empty State', () => {
    it('should display empty state when no phases', () => {
      phaseServiceMock.getTree.mockReturnValue(of([]));
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const emptyEl = compiled.querySelector('[data-testid="empty-state"]');
      expect(emptyEl).toBeTruthy();
      expect(emptyEl?.textContent).toContain('No phases found');
    });
  });

  describe('Tree Table', () => {
    it('should render tree table with data', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const treeTable = compiled.querySelector('[data-testid="phase-tree"]');
      expect(treeTable).toBeTruthy();
    });

    it('should transform API data to TreeNode format', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const nodes = component.treeNodes();
      expect(nodes.length).toBe(1);
      expect(nodes[0].data?.title).toBe('Sprint 1');
      expect(nodes[0].children?.length).toBe(2);
    });

    it('should expand first level by default', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      const component = fixture.componentInstance;
      const nodes = component.treeNodes();
      expect(nodes[0].expanded).toBe(true); // depth 0 < 1
    });
  });

  describe('Status Helpers', () => {
    it('should return correct severity for status', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusSeverity('completed')).toBe('success');
      expect(component.getStatusSeverity('in_progress')).toBe('info');
      expect(component.getStatusSeverity('blocked')).toBe('danger');
      expect(component.getStatusSeverity('skipped')).toBe('secondary');
      expect(component.getStatusSeverity('planned')).toBe('warn');
      expect(component.getStatusSeverity(undefined)).toBe('warn');
    });

    it('should return correct label for status', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      const component = fixture.componentInstance;

      expect(component.getStatusLabel('completed')).toBe('Completed');
      expect(component.getStatusLabel('in_progress')).toBe('In Progress');
      expect(component.getStatusLabel('blocked')).toBe('Blocked');
      expect(component.getStatusLabel('skipped')).toBe('Skipped');
      expect(component.getStatusLabel('planned')).toBe('Planned');
      expect(component.getStatusLabel(undefined)).toBe('Planned');
    });
  });

  describe('Priority Helpers', () => {
    it('should return correct severity for priority', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      const component = fixture.componentInstance;

      expect(component.getPrioritySeverity('critical')).toBe('danger');
      expect(component.getPrioritySeverity('high')).toBe('warn');
      expect(component.getPrioritySeverity('medium')).toBe('info');
      expect(component.getPrioritySeverity('low')).toBe('success');
      expect(component.getPrioritySeverity(undefined)).toBe('secondary');
      expect(component.getPrioritySeverity('unknown')).toBe('secondary');
    });
  });

  describe('Progress Bar', () => {
    it('should return correct class for progress value', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      const component = fixture.componentInstance;

      expect(component.getProgressBarClass(100)).toBe('phases__progress--complete');
      expect(component.getProgressBarClass(75)).toBe('phases__progress--half');
      expect(component.getProgressBarClass(50)).toBe('phases__progress--half');
      expect(component.getProgressBarClass(25)).toBe('phases__progress--started');
      expect(component.getProgressBarClass(0)).toBe('phases__progress--empty');
    });
  });

  describe('API Integration', () => {
    it('should call PhaseService.getTree on init', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      expect(phaseServiceMock.getTree).toHaveBeenCalledWith('test-plan-id', {
        fields: ['title', 'status', 'progress', 'priority', 'path', 'description', 'blockingReason']
      });
    });

    it('should reload data on refresh click', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      phaseServiceMock.getTree.mockClear();
      const component = fixture.componentInstance;
      component.loadPhaseTree();

      expect(phaseServiceMock.getTree).toHaveBeenCalledTimes(1);
    });

    it('should reload phase tree when activePlanId changes', () => {
      const fixture = TestBed.createComponent(PhasesComponent);
      fixture.detectChanges();

      expect(phaseServiceMock.getTree).toHaveBeenCalledTimes(1);

      // Change active plan
      activePlanIdSignal.set('plan-2');
      TestBed.flushEffects();
      fixture.detectChanges();

      // Should reload with new planId
      expect(phaseServiceMock.getTree).toHaveBeenCalledTimes(2);
      expect(phaseServiceMock.getTree).toHaveBeenCalledWith('plan-2', {
        fields: ['title', 'status', 'progress', 'priority', 'path', 'description', 'blockingReason']
      });
    });
  });
});
