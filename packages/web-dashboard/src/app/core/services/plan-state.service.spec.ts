/**
 * RED: Phase 4.2.2 - Tests for PlanStateService without defaultPlanId
 *
 * These tests verify the new behavior after removing defaultPlanId:
 * - activePlanId() returns null when no plan is set (not default UUID)
 * - hasActivePlan() returns false when activePlanId is null
 * - clearActivePlan() results in null activePlanId (not default UUID)
 * - localStorage integration works correctly
 */

import { TestBed } from '@angular/core/testing';
import { PlanStateService } from './plan-state.service';

describe('PlanStateService', () => {
  let service: PlanStateService;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();

    TestBed.configureTestingModule({});
    service = TestBed.inject(PlanStateService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('RED: should return null when no plan is set (not default UUID)', () => {
      // RED: Currently returns '261825f1-cef0-4227-873c-a20c7e81a9de', should return null
      expect(service.activePlanId()).toBeNull();
    });

    it('RED: should return false for hasActivePlan when no plan is set', () => {
      // RED: Currently returns true (because of defaultPlanId), should return false
      expect(service.hasActivePlan()).toBe(false);
    });
  });

  describe('setActivePlan', () => {
    it('should set active plan ID', () => {
      const planId = 'test-plan-123';

      service.setActivePlan(planId);

      expect(service.activePlanId()).toBe(planId);
      expect(service.hasActivePlan()).toBe(true);
    });

    it('should persist active plan to localStorage', () => {
      const planId = 'test-plan-456';

      service.setActivePlan(planId);

      const saved = localStorage.getItem('active-plan-id');
      expect(saved).toBe(planId);
    });

    it('should update hasActivePlan to true', () => {
      service.setActivePlan('plan-789');

      expect(service.hasActivePlan()).toBe(true);
    });
  });

  describe('clearActivePlan', () => {
    it('RED: should set activePlanId to null (not default UUID)', () => {
      service.setActivePlan('test-plan');

      service.clearActivePlan();

      // RED: Currently returns '261825f1-cef0-4227-873c-a20c7e81a9de', should return null
      expect(service.activePlanId()).toBeNull();
    });

    it('should set hasActivePlan to false', () => {
      service.setActivePlan('test-plan');

      service.clearActivePlan();

      expect(service.hasActivePlan()).toBe(false);
    });

    it('should remove plan from localStorage', () => {
      service.setActivePlan('test-plan');
      expect(localStorage.getItem('active-plan-id')).toBeTruthy();

      service.clearActivePlan();

      expect(localStorage.getItem('active-plan-id')).toBeNull();
    });
  });

  describe('localStorage persistence', () => {
    it('should load activePlanId from localStorage on initialization', () => {
      const planId = 'persisted-plan';
      localStorage.setItem('active-plan-id', planId);

      // Reset TestBed and create new service instance to trigger loadActivePlan()
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(PlanStateService);

      expect(newService.activePlanId()).toBe(planId);
      expect(newService.hasActivePlan()).toBe(true);
    });

    it('RED: should return null when localStorage is empty (not default UUID)', () => {
      localStorage.clear();

      // Reset TestBed and create new service instance
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const newService = TestBed.inject(PlanStateService);

      // RED: Currently returns '261825f1-cef0-4227-873c-a20c7e81a9de', should return null
      expect(newService.activePlanId()).toBeNull();
      expect(newService.hasActivePlan()).toBe(false);
    });
  });

  describe('signal reactivity', () => {
    it('should update computed signal when activePlanId changes', () => {
      const planId1 = 'plan-1';
      const planId2 = 'plan-2';

      service.setActivePlan(planId1);
      expect(service.activePlanId()).toBe(planId1);

      service.setActivePlan(planId2);
      expect(service.activePlanId()).toBe(planId2);
    });

    it('should update hasActivePlan when clearing plan', () => {
      service.setActivePlan('test-plan');
      expect(service.hasActivePlan()).toBe(true);

      service.clearActivePlan();
      expect(service.hasActivePlan()).toBe(false);
    });
  });
});
