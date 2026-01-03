import { Injectable, signal, computed } from '@angular/core';

/**
 * GREEN: Phase 4.2.3 - Global state service for active plan management.
 * Uses Angular Signals for reactive state.
 *
 * BREAKING CHANGE: activePlanId() now returns string | null instead of string.
 * All consumers must add null-guards before accessing.
 */
@Injectable({
  providedIn: 'root'
})
export class PlanStateService {
  public readonly activePlanId = computed(() => this.activePlanIdSignal());
  public readonly hasActivePlan = computed(() => this.activePlanIdSignal() !== null);

  private readonly activePlanIdSignal = signal<string | null>(null);
  private readonly planStorageKey = 'active-plan-id';

  constructor() {
    this.loadActivePlan();
  }

  public setActivePlan(planId: string): void {
    this.activePlanIdSignal.set(planId);
    this.saveActivePlan(planId);
  }

  public clearActivePlan(): void {
    this.activePlanIdSignal.set(null);
    localStorage.removeItem(this.planStorageKey);
  }

  private loadActivePlan(): void {
    const savedPlanId = localStorage.getItem(this.planStorageKey);
    if (savedPlanId) {
      this.activePlanIdSignal.set(savedPlanId);
    }
  }

  private saveActivePlan(planId: string): void {
    localStorage.setItem(this.planStorageKey, planId);
  }
}
