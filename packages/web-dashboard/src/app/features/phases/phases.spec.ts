import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { PhasesComponent } from './phases';

describe('PhasesComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhasesComponent]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(PhasesComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display phases title', () => {
    const fixture = TestBed.createComponent(PhasesComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.phases__title')?.textContent).toContain('Phases');
  });

  it('should have data-testid for e2e testing', () => {
    const fixture = TestBed.createComponent(PhasesComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="phases-page"]')).toBeTruthy();
  });
});
