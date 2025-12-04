export interface UsageGuideCommand {
  cmd: string;
  desc: string;
  tip?: string;
}

export interface UsageGuide {
  quickStart: string;
  commands: {
    overview: UsageGuideCommand[];
    detailed: UsageGuideCommand[];
  };
  formattingGuide: string;
  warnings: string[];
}
