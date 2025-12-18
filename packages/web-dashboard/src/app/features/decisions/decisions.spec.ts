import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { DecisionsComponent } from './decisions';

describe('DecisionsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DecisionsComponent]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DecisionsComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display decisions title', () => {
    const fixture = TestBed.createComponent(DecisionsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.decisions__title')?.textContent).toContain('Decisions');
  });

  it('should have data-testid for e2e testing', () => {
    const fixture = TestBed.createComponent(DecisionsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="decisions-page"]')).toBeTruthy();
  });
});
