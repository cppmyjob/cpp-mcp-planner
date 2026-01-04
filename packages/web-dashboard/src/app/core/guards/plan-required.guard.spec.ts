/**
 * GREEN: Phase 4.15 - Tests for planRequiredGuard
 */

import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { planRequiredGuard } from './plan-required.guard';
import { PlanStateService } from '../services';

describe('planRequiredGuard', () => {
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };
  let hasActivePlanSignal: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    // Create signal for mocking hasActivePlan
    hasActivePlanSignal = signal(false);

    // Mock Router
    mockRouter = {
      navigate: vi.fn()
    };

    // Mock PlanStateService
    const mockPlanStateService = {
      hasActivePlan: () => hasActivePlanSignal()
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: mockRouter },
        { provide: PlanStateService, useValue: mockPlanStateService }
      ]
    });
  });

  describe('when plan is active', () => {
    it('should allow navigation when hasActivePlan returns true', () => {
      // Arrange
      hasActivePlanSignal.set(true);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act
      const result = TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));

      // Assert
      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('when plan is not active', () => {
    it('should block navigation when hasActivePlan returns false', () => {
      // Arrange
      hasActivePlanSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act
      const result = TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));

      // Assert
      expect(result).toBe(false);
    });

    it('should redirect to root with returnUrl when hasActivePlan returns false', () => {
      // Arrange
      hasActivePlanSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act
      TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { returnUrl: '/dashboard' }
      });
    });

    it('should redirect exactly once when blocking navigation', () => {
      // Arrange
      hasActivePlanSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/phases' } as any;

      // Act
      TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));

      // Assert
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    });
  });

  describe('state transitions', () => {
    it('should allow navigation after plan becomes active', () => {
      // Arrange - Start without plan
      hasActivePlanSignal.set(false);
      const mockRoute = {} as any;
      const mockState = { url: '/dashboard' } as any;

      // Act & Assert - First attempt blocked
      let result1 = TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));
      expect(result1).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);

      // Arrange - Plan becomes active
      hasActivePlanSignal.set(true);
      mockRouter.navigate.mockClear();

      // Act & Assert - Second attempt allowed
      let result2 = TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));
      expect(result2).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('should block navigation after plan becomes inactive', () => {
      // Arrange - Start with plan
      hasActivePlanSignal.set(true);
      const mockRoute = {} as any;
      const mockState = { url: '/requirements' } as any;

      // Act & Assert - First attempt allowed
      let result1 = TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));
      expect(result1).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();

      // Arrange - Plan becomes inactive
      hasActivePlanSignal.set(false);

      // Act & Assert - Second attempt blocked
      let result2 = TestBed.runInInjectionContext(() => planRequiredGuard(mockRoute, mockState));
      expect(result2).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/'], {
        queryParams: { returnUrl: '/requirements' }
      });
    });
  });
});
