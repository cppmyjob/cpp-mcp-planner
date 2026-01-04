/**
 * GREEN: Phase 2.11.3 - ProjectContextMiddleware
 *
 * NestJS middleware that:
 * 1. Extracts X-Project-Id from request headers
 * 2. Validates header presence (returns 400 if missing/empty)
 * 3. Sets AsyncLocalStorage context via runWithProjectContext()
 * 4. Calls next() within the context
 *
 * This middleware enables multi-project support in web-server by integrating
 * with core's AsyncLocalStorage-based project-context.ts.
 *
 * References:
 * - Decision 20: Hybrid Approach (native AsyncLocalStorage, no nestjs-cls needed)
 * - Decision 8: API Convention - X-Project-Id header
 */

import { Injectable, type NestMiddleware, BadRequestException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { runWithProjectContext, isValidProjectId } from '@mcp-planner/core';

/**
 * Middleware that extracts projectId from X-Project-Id header and sets AsyncLocalStorage context
 */
@Injectable()
export class ProjectContextMiddleware implements NestMiddleware {
  public use(req: Request, res: Response, next: NextFunction): void {
    const projectId = req.headers['x-project-id'] as string | undefined;

    // Validate header presence
    if (projectId === undefined || projectId.trim() === '') {
      throw new BadRequestException('X-Project-Id header is required');
    }

    const trimmedId = projectId.trim();

    // Validate projectId format before setting context
    if (!isValidProjectId(trimmedId)) {
      throw new BadRequestException(
        `Invalid X-Project-Id header: "${trimmedId}". ` +
        `Must be lowercase alphanumeric with hyphens, 3-50 chars.`
      );
    }

    // GREEN: Phase 2.11.4 - Context propagation through AsyncLocalStorage
    // Run next() within the project context and wait for response completion.
    // The callback MUST be async to preserve context through the entire request lifecycle.
    // AsyncLocalStorage only propagates context through async continuations (Promise chains).
    // We wait for 'finish' or 'close' events to ensure context lives until response is sent.
    // Note: runWithProjectContext() is validated above (line 38-43) so errors should not occur,
    // but we catch them defensively to prevent unhandled promise rejections.
    //
    // IMPORTANT: We use a resolved flag and cleanup handlers to prevent:
    // 1. Memory leaks from dangling event listeners on rapid request cycles
    // 2. Double-resolution if both 'finish' and 'close' events fire
    // 3. Resource leaks if response errors occur
    void Promise.resolve(
      runWithProjectContext(trimmedId, async () => {
        await new Promise<void>((resolve) => {
          let resolved = false;

          const cleanup = (): void => {
            if (!resolved) {
              resolved = true;
              res.removeListener('finish', cleanup);
              res.removeListener('close', cleanup);
              resolve();
            }
          };

          res.on('finish', cleanup);
          res.on('close', cleanup);
          next();
        });
      })
    ).catch((error: unknown) => {
      // This should never happen due to pre-validation, but handle defensively
      const message = error instanceof Error ? error.message : String(error);
      next(new Error(`Failed to set project context: ${message}`));
    });
  }
}
