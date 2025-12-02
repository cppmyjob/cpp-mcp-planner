import { v4 as uuidv4 } from 'uuid';
import type { FileStorage } from '../../infrastructure/file-storage.js';
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
  link: Link;
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
  constructor(private storage: FileStorage) {}

  async linkEntities(input: LinkEntitiesInput): Promise<LinkEntitiesResult> {
    const links = await this.storage.loadLinks(input.planId);

    // Check for cycle if depends_on
    if (input.relationType === 'depends_on') {
      const hasCycle = this.detectCycle(links, input.sourceId, input.targetId);
      if (hasCycle) {
        throw new Error('Circular dependency detected');
      }
    }

    // Check if link already exists
    const existing = links.find(
      (l) =>
        l.sourceId === input.sourceId &&
        l.targetId === input.targetId &&
        l.relationType === input.relationType
    );

    if (existing) {
      throw new Error('Link already exists');
    }

    const linkId = uuidv4();
    const now = new Date().toISOString();

    const link: Link = {
      id: linkId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      relationType: input.relationType,
      metadata: input.metadata,
      createdAt: now,
      createdBy: 'claude-code',
    };

    links.push(link);
    await this.storage.saveLinks(input.planId, links);

    return { linkId, link };
  }

  async getEntityLinks(input: GetEntityLinksInput): Promise<GetEntityLinksResult> {
    const links = await this.storage.loadLinks(input.planId);
    const direction = input.direction || 'both';

    let outgoing: Link[] = [];
    let incoming: Link[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      outgoing = links.filter((l) => l.sourceId === input.entityId);
      if (input.relationType) {
        outgoing = outgoing.filter((l) => l.relationType === input.relationType);
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      incoming = links.filter((l) => l.targetId === input.entityId);
      if (input.relationType) {
        incoming = incoming.filter((l) => l.relationType === input.relationType);
      }
    }

    return {
      entityId: input.entityId,
      links: [...outgoing, ...incoming],
      outgoing,
      incoming,
    };
  }

  async unlinkEntities(input: UnlinkEntitiesInput): Promise<UnlinkEntitiesResult> {
    const links = await this.storage.loadLinks(input.planId);
    const deletedIds: string[] = [];

    let remaining: Link[];

    if (input.linkId) {
      // Delete by linkId
      remaining = links.filter((l) => {
        if (l.id === input.linkId) {
          deletedIds.push(l.id);
          return false;
        }
        return true;
      });
    } else {
      // Delete by source/target/type
      remaining = links.filter((l) => {
        const matchSource = input.sourceId ? l.sourceId === input.sourceId : true;
        const matchTarget = input.targetId ? l.targetId === input.targetId : true;
        const matchType = input.relationType ? l.relationType === input.relationType : true;

        if (matchSource && matchTarget && matchType) {
          deletedIds.push(l.id);
          return false;
        }
        return true;
      });
    }

    await this.storage.saveLinks(input.planId, remaining);

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
    const links = await this.storage.loadLinks(planId);
    return links.filter((l) => l.sourceId === entityId || l.targetId === entityId);
  }

  // Delete all links for an entity (for cascading delete)
  async deleteLinksForEntity(planId: string, entityId: string): Promise<number> {
    const links = await this.storage.loadLinks(planId);
    const remaining = links.filter(
      (l) => l.sourceId !== entityId && l.targetId !== entityId
    );
    const deleted = links.length - remaining.length;
    await this.storage.saveLinks(planId, remaining);
    return deleted;
  }
}

export default LinkingService;
