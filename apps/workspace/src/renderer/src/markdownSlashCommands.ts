import type { AnchorRect } from "./components/Popover";

export type SlashCommandCategory = "ai";

export type SlashCommandContext = {
  slashFrom: number;
  slashTo: number;
  query: string;
};

export type SlashCommandDef = {
  id: string;
  category: SlashCommandCategory;
  label: string;
  description: string;
  keywords: string[];
  run: (ctx: SlashCommandContext) => void;
};

export type SlashCommandActiveState = {
  query: string;
  slashFrom: number;
  slashTo: number;
  anchorRect: AnchorRect;
};

export const MARKDOWN_SLASH_COMMANDS: SlashCommandDef[] = [
  {
    id: "ai.augment",
    category: "ai",
    label: "증강",
    description: "문서를 읽고 내용 자동 추가",
    keywords: ["증강", "augment", "보강"],
    run: () => {},
  },
];

export function createMarkdownSlashCommands(handlers: {
  onAugment: (ctx: SlashCommandContext) => void;
}): SlashCommandDef[] {
  return [
    {
      id: "ai.augment",
      category: "ai",
      label: "증강",
      description: "문서를 읽고 내용 자동 추가",
      keywords: ["증강", "augment", "보강"],
      run: handlers.onAugment,
    },
  ];
}

function matchesCommand(command: SlashCommandDef, needle: string): boolean {
  const q = needle.toLowerCase();
  if (!q) return true;
  if (command.category.toLowerCase().includes(q)) return true;
  if (command.label.toLowerCase().includes(q)) return true;
  return command.keywords.some((keyword) => keyword.toLowerCase().includes(q));
}

export function filterSlashCommands(query: string, commands = MARKDOWN_SLASH_COMMANDS): SlashCommandDef[] {
  const raw = query.replace(/^\//, "").trim().toLowerCase();
  if (!raw) return commands;

  if (raw === "ai" || raw.startsWith("ai ")) {
    const sub = raw.slice(2).trim();
    const aiCommands = commands.filter((command) => command.category === "ai");
    if (!sub) return aiCommands;
    return aiCommands.filter((command) => matchesCommand(command, sub));
  }

  return commands.filter((command) => matchesCommand(command, raw));
}

export function slashCommandDisplayLabel(command: SlashCommandDef): string {
  return `${command.category} › ${command.label}`;
}
