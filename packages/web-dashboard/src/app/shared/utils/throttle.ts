/**
 * Throttle function execution to limit how often it can be called
 * @param fn - Function to throttle
 * @param wait - Minimum time between executions in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;

  return function (this: any, ...args: Parameters<T>) {
    const now = Date.now();

    if (now - lastRun >= wait) {
      fn.apply(this, args);
      lastRun = now;
    } else {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        fn.apply(this, args);
        lastRun = Date.now();
      }, wait - (now - lastRun));
    }
  };
}
