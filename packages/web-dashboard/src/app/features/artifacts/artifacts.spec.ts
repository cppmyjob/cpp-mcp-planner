import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { ArtifactsComponent } from './artifacts';

describe('ArtifactsComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArtifactsComponent]
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(ArtifactsComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('should display artifacts title', () => {
    const fixture = TestBed.createComponent(ArtifactsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.artifacts__title')?.textContent).toContain('Artifacts');
  });

  it('should have data-testid for e2e testing', () => {
    const fixture = TestBed.createComponent(ArtifactsComponent);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[data-testid="artifacts-page"]')).toBeTruthy();
  });
});
