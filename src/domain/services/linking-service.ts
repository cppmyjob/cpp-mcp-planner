import { v4 as uuidv4 } from 'uuid';
import type { RepositoryFactory } from '../../infrastructure/factory/repository-factory.js';
import type { Link, RelationType, Entity } from '../entities/types.js';

// Input types
export interface LinkEntitiesInput {
  planId: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  metadata?: Record<string, unknown>;
}

export interface GetEntityLinksInput {
  planId: string;
  entityId: string;
  relationType?: RelationType;
  direction?: 'outgoing' | 'incoming' | 'both';
}

export interface UnlinkEntitiesInput {
  planId: string;
  linkId?: string;
  sourceId?: string;
  targetId?: string;
  relationType?: RelationType;
}

// Output types
export interface LinkEntitiesResult {
  linkId: string;
}

export interface GetEntityLinksResult {
  entityId: string;
  links: Link[];
  outgoing: Link[];
  incoming: Link[];
}

export interface UnlinkEntitiesResult {
  success: boolean;
  deletedLinkIds: string[];
}

export class LinkingService {
  constructor(private repositoryFactory: RepositoryFactory) {}

  async linkEntities(input: LinkEntitiesInput): Promise<LinkEntitiesResult> {
    const linkRepo = this.repositoryFactory.createLinkRepository(input.planId);

    // Check for cycle if depends_on
    if (input.relationType === 'depends_on') {
      const links = await linkRepo.findAllLinks('depends_on');
      const hasCycle = this.detectCycle(links, input.sourceId, input.targetId);
      if (hasCycle) {
        throw new Error('Circular dependency detected');
      }
    }

    // Check if link already exists
    const exists = await linkRepo.linkExists(input.sourceId, input.targetId, input.relationType);
    if (exists) {
      throw new Error('Link already exists');
    }

    // Create link
    const link = await linkRepo.createLink({
      sourceId: input.sourceId,
      targetId: input.targetId,
      relationType: input.relationType,
      metadata: input.metadata,
    });

    return { linkId: link.id };
  }

  async getEntityLinks(input: GetEntityLinksInput): Promise<GetEntityLinksResult> {
    const linkRepo = this.repositoryFactory.createLinkRepository(input.planId);

    const direction = input.direction || 'both';
    let outgoing: Link[] = [];
    let incoming: Link[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      outgoing = await linkRepo.findLinksBySource(input.entityId, input.relationType);
    }

    if (direction === 'incoming' || direction === 'both') {
      incoming = await linkRepo.findLinksByTarget(input.entityId, input.relationType);
    }

    return {
      entityId: input.entityId,
      links: [...outgoing, ...incoming],
      outgoing,
      incoming,
    };
  }

  async unlinkEntities(input: UnlinkEntitiesInput): Promise<UnlinkEntitiesResult> {
    const linkRepo = this.repositoryFactory.createLinkRepository(input.planId);

    const deletedIds: string[] = [];

    if (input.linkId) {
      // Delete by linkId
      await linkRepo.deleteLink(input.linkId);
      deletedIds.push(input.linkId);
    } else {
      // Delete by source/target/type - need to find matching links first
      const allLinks = await linkRepo.findAllLinks(input.relationType);

      for (const link of allLinks) {
        const matchSource = input.sourceId ? link.sourceId === input.sourceId : true;
        const matchTarget = input.targetId ? link.targetId === input.targetId : true;

        if (matchSource && matchTarget) {
          await linkRepo.deleteLink(link.id);
          deletedIds.push(link.id);
        }
      }
    }

    return {
      success: true,
      deletedLinkIds: deletedIds,
    };
  }

  // DFS cycle detection
  private detectCycle(links: Link[], sourceId: string, targetId: string): boolean {
    // Build adjacency list for depends_on links
    const graph = new Map<string, string[]>();

    for (const link of links) {
      if (link.relationType === 'depends_on') {
        if (!graph.has(link.sourceId)) {
          graph.set(link.sourceId, []);
        }
        graph.get(link.sourceId)!.push(link.targetId);
      }
    }

    // Add the proposed link temporarily
    if (!graph.has(sourceId)) {
      graph.set(sourceId, []);
    }
    graph.get(sourceId)!.push(targetId);

    // DFS to detect cycle
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (stack.has(node)) return true; // Cycle!
      if (visited.has(node)) return false;

      visited.add(node);
      stack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }

      stack.delete(node);
      return false;
    };

    // Check from sourceId
    return dfs(sourceId);
  }

  // Helper to get all links for an entity (for referential integrity check)
  async getLinksForEntity(planId: string, entityId: string): Promise<Link[]> {
    const linkRepo = this.repositoryFactory.createLinkRepository(planId);
    return linkRepo.findLinksByEntity(entityId, 'both');
  }

  // Delete all links for an entity (for cascading delete)
  async deleteLinksForEntity(planId: string, entityId: string): Promise<number> {
    const linkRepo = this.repositoryFactory.createLinkRepository(planId);
    return linkRepo.deleteLinksForEntity(entityId);
  }
}

export default LinkingService;
