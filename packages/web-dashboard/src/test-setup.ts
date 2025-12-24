/**
 * Test setup file for Angular unit tests with Vitest
 *
 * This file provides polyfills for browser APIs that are not available in JSDOM:
 * - ResizeObserver (used by ScrollContainerDirective)
 * - Canvas context (used by Chart.js)
 * - matchMedia (used for responsive/theme detection)
 * - requestAnimationFrame (used for smooth animations)
 */

import { vi } from 'vitest';

// ============================================================================
// ResizeObserver Polyfill
// Used by: ScrollContainerDirective for detecting container size changes
// ============================================================================
class ResizeObserverMock implements ResizeObserver {
  private callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  public observe(_target: Element, _options?: ResizeObserverOptions): void {
    // Trigger initial callback with empty entries
    this.callback([], this);
  }

  public unobserve(_target: Element): void {
    // No-op in tests
  }

  public disconnect(): void {
    // No-op in tests
  }
}

(globalThis as Record<string, unknown>)['ResizeObserver'] = ResizeObserverMock;

// ============================================================================
// Canvas Context Polyfill
// Used by: Chart.js (RequirementsChartComponent)
// ============================================================================
const canvasContextMock = {
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: [] })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => []),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  fill: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
  createLinearGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn(),
  })),
  createPattern: vi.fn(),
  fillText: vi.fn(),
  strokeText: vi.fn(),
  bezierCurveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  // Properties
  canvas: { width: 300, height: 150 },
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
  font: '10px sans-serif',
  textAlign: 'start',
  textBaseline: 'alphabetic',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
};

HTMLCanvasElement.prototype.getContext = vi.fn(
  () => canvasContextMock
) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// ============================================================================
// matchMedia Polyfill
// Used by: Theme detection, responsive layouts
// ============================================================================
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// ============================================================================
// requestAnimationFrame Polyfill
// Used by: Smooth animations, scroll handling
// ============================================================================
if (typeof window.requestAnimationFrame === 'undefined') {
  (window as Window & { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
    vi.fn((callback: FrameRequestCallback) => {
      return setTimeout(() => callback(Date.now()), 16) as unknown as number;
    });
}

if (typeof window.cancelAnimationFrame === 'undefined') {
  (window as Window & { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
    vi.fn((id: number) => {
      clearTimeout(id);
    });
}

// ============================================================================
// IntersectionObserver Polyfill
// Used by: Lazy loading, visibility detection
// ============================================================================
if (typeof window.IntersectionObserver === 'undefined') {
  class IntersectionObserverMock implements IntersectionObserver {
    public readonly root: Element | Document | null = null;
    public readonly rootMargin: string = '';
    public readonly thresholds: readonly number[] = [];

    constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}

    public observe(_target: Element): void {}
    public unobserve(_target: Element): void {}
    public disconnect(): void {}
    public takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  (window as Window & { IntersectionObserver: typeof IntersectionObserver }).IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver;
}

// ============================================================================
// Suppress Angular warnings in tests (optional)
// ============================================================================
// Uncomment to suppress Angular warnings in tests:
// const originalWarn = console.warn;
// console.warn = (...args: unknown[]) => {
//   if (typeof args[0] === 'string' && args[0].includes('NG')) return;
//   originalWarn.apply(console, args);
// };
