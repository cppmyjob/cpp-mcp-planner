import { describe, it, expect } from '@jest/globals';
import { tools } from '../../src/server/tool-definitions.js';

describe('Tool Definitions', () => {
  describe('Plan Tool Description UX', () => {
    it('should recommend get_summary for plan overview', () => {
      const planTool = tools.find(t => t.name === 'plan');
      expect(planTool).toBeDefined();
      expect(planTool!.description).toContain('get_summary');
    });

    it('should warn that includeEntities is for export/backup only', () => {
      const planTool = tools.find(t => t.name === 'plan');
      expect(planTool!.description).toMatch(/includeEntities.*export|backup/i);
    });

    it('should have get_summary in enum', () => {
      const planTool = tools.find(t => t.name === 'plan');
      const actionProp = planTool!.inputSchema.properties?.action as { enum?: string[] };
      expect(actionProp?.enum).toContain('get_summary');
    });
  });

  describe('Phase Tool Description UX', () => {
    it('should recommend get_tree with fields for overview', () => {
      const phaseTool = tools.find(t => t.name === 'phase');
      expect(phaseTool).toBeDefined();
      expect(phaseTool!.description).toContain('get_tree');
      expect(phaseTool!.description).toContain('fields');
    });

    it('should mention summary or overview in context', () => {
      const phaseTool = tools.find(t => t.name === 'phase');
      expect(phaseTool!.description).toMatch(/overview|summary/i);
    });
  });

  describe('Phase Tool Description', () => {
    it('should reference link tool for creating phase dependencies', () => {
      const phaseTool = tools.find(t => t.name === 'phase');
      expect(phaseTool).toBeDefined();

      const description = phaseTool!.description;

      // Verify link tool is mentioned
      expect(description.toLowerCase()).toContain('link tool');

      // Verify depends_on relation is mentioned
      expect(description).toContain('depends_on');

      // Verify the context is about phase dependencies
      expect(description.toLowerCase()).toMatch(/link tool.*depends_on|depends_on.*link tool/);
    });
  });

  describe('Link Tool Description', () => {
    it('should already include depends_on with phase->phase example', () => {
      const linkTool = tools.find(t => t.name === 'link');
      expect(linkTool).toBeDefined();

      const description = linkTool!.description;

      // Verify depends_on is listed
      expect(description).toContain('depends_on');

      // Verify phase->phase example exists
      expect(description).toContain('phase->phase');

      // Verify cycle detection is mentioned
      expect(description).toContain('cycle detection');
    });
  });
});
