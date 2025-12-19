import { Injectable, signal, computed } from '@angular/core';

/**
 * Global state service for active plan management.
 * Uses Angular Signals for reactive state.
 */
@Injectable({
  providedIn: 'root'
})
export class PlanStateService {
  private readonly activePlanIdSignal = signal<string | null>(null);
  private readonly planStorageKey = 'active-plan-id';

  // Default plan for development/testing
  private readonly defaultPlanId = '261825f1-cef0-4227-873c-a20c7e81a9de';

  public readonly activePlanId = computed(() => this.activePlanIdSignal() ?? this.defaultPlanId);
  public readonly hasActivePlan = computed(() => this.activePlanIdSignal() !== null);

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
