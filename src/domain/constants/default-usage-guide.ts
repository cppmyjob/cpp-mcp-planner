import { UsageGuide } from '../entities/usage-guide.js';

export const DEFAULT_USAGE_GUIDE: UsageGuide = {
  quickStart: "Use 'phase get_tree' for overview, then drill down with 'phase get' for details. Check plan health with 'query validate'.",

  commands: {
    overview: [
      {
        cmd: 'phase get_tree',
        desc: 'Hierarchical view of all phases',
        tip: 'Use maxDepth: 2 and includeCompleted: false for cleaner view',
      },
      {
        cmd: 'requirement list',
        desc: 'List requirements with status',
        tip: "Filter by priority: 'high' or category: 'functional'",
      },
      {
        cmd: 'query validate',
        desc: 'Check plan integrity (uncovered requirements, broken links)',
      },
      {
        cmd: 'phase get_next_actions',
        desc: 'Get next actionable phases to work on',
      },
    ],
    detailed: [
      {
        cmd: "phase get --phaseId <id> --fields ['description', 'objectives']",
        desc: 'Get specific phase details',
        tip: 'Only request needed fields to save tokens',
      },
      {
        cmd: 'query trace --requirementId <id>',
        desc: 'Trace requirement through solutions to implementation',
      },
      {
        cmd: 'solution compare --solutionIds [id1, id2]',
        desc: 'Compare alternative solutions with tradeoffs',
      },
      {
        cmd: 'query export --format markdown',
        desc: 'Export full plan as markdown document',
      },
    ],
  },

  formattingGuide: `## Output Formatting

### Tree View Structure
\`\`\`
├── 1. Sprint Name ✅ [100%]
│   ├── 1.1. Phase Name ⏳ [████████░░] 80%
│   └── 1.2. Phase Name ○
└── 2. Sprint Name ○
    ├── 2.1. Phase Name ○
    └── 2.2. Phase Name ⚠️ BLOCKED
\`\`\`

### Status Indicators
- ✅ completed
- ⏳ in_progress
- ○ planned
- ⚠️ blocked
- 🎯 selected (for solutions)

### Priority Indicators
- 🔴 Critical
- 🟡 High
- 🟢 Medium
- ⚪ Low

### Colors (use ANSI codes in terminal output)
- **Green**: completed phases/requirements
- **Yellow**: in-progress items
- **Red**: blocked items, critical priority
- **Gray**: low priority or archived

### Progress Display
- ASCII bars: \`[████████░░] 80%\`
- Or emoji blocks: \`▓▓▓▓▓▓▓▓░░ 80%\`

### Summary Statistics
Always start output with overview:
\`\`\`
📊 Plan: "MCP Planning v2"
Progress: 12/20 phases (60%) | ✅ 8 done | ⏳ 4 active | ⚠️ 2 blocked
\`\`\`

### Grouping
- Group phases by parent/sprint
- Group requirements by priority
- Show completed items at bottom or hide them`,

  warnings: [
    "NEVER use fields: ['*'] - returns massive output, exhausts context",
    "DON'T load all entities without filters - use status/priority filters or pagination",
    "AVOID requesting full details in tree/list views - use summary mode, drill down selectively",
    "DON'T exceed maxDepth: 3 in phase trees - deep nesting becomes unreadable",
  ],
};
