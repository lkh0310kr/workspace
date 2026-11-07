import type React from "react";
import type { TuiAgent } from "../../../shared/agent/tui-agent";
import { ClaudeIcon, DroidIcon, OpenAIIcon } from "./agent-status-bar-icons";
import {
  AgentLetterIcon,
  AiderIcon,
  CopilotIcon,
  KiloIcon,
  OmpIcon,
  OpenCodeIcon,
  PiIcon,
} from "./agent-icon-glyphs";
import { AGENT_FAVICON_ASSETS } from "./agent-favicon-assets";

export type AgentCatalogEntry = {
  id: TuiAgent;
  label: string;
  iconUrl?: string;
  faviconDomain?: string;
};

// Ported from ref-proj/orca agent-catalog.tsx (labels + favicon domains only).
export const AGENT_CATALOG: AgentCatalogEntry[] = [
  { id: "claude", label: "Claude" },
  { id: "openclaude", label: "OpenClaude" },
  { id: "codex", label: "Codex" },
  { id: "grok", label: "Grok", faviconDomain: "x.ai" },
  { id: "copilot", label: "GitHub Copilot" },
  { id: "opencode", label: "OpenCode" },
  { id: "mimo-code", label: "MiMo Code", faviconDomain: "mimo.xiaomi.com" },
  { id: "ante", label: "Ante", faviconDomain: "antigma.ai" },
  { id: "trae", label: "Trae", faviconDomain: "www.trae.cn" },
  { id: "pi", label: "Pi" },
  { id: "omp", label: "OMP" },
  { id: "prime-agent", label: "Prime Agent", faviconDomain: "primeintellect.ai" },
  { id: "gemini", label: "Gemini", faviconDomain: "gemini.google.com" },
  { id: "antigravity", label: "Antigravity", faviconDomain: "antigravity.google" },
  { id: "aider", label: "Aider" },
  { id: "goose", label: "Goose", faviconDomain: "goose-docs.ai" },
  { id: "amp", label: "Amp", faviconDomain: "ampcode.com" },
  { id: "kilo", label: "Kilocode" },
  { id: "kiro", label: "Kiro", faviconDomain: "kiro.dev" },
  { id: "crush", label: "Charm", faviconDomain: "charm.sh" },
  { id: "aug", label: "Auggie", faviconDomain: "augmentcode.com" },
  { id: "autohand", label: "Autohand Code", faviconDomain: "autohand.ai" },
  { id: "cline", label: "Cline", faviconDomain: "cline.bot" },
  { id: "codebuff", label: "Codebuff", faviconDomain: "codebuff.com" },
  { id: "command-code", label: "Command Code", faviconDomain: "commandcode.ai" },
  { id: "continue", label: "Continue", faviconDomain: "continue.dev" },
  { id: "cursor", label: "Cursor", faviconDomain: "cursor.com" },
  { id: "droid", label: "Droid" },
  { id: "kimi", label: "Kimi", faviconDomain: "moonshot.cn" },
  { id: "mistral-vibe", label: "Mistral Vibe", faviconDomain: "mistral.ai" },
  { id: "qwen-code", label: "Qwen Code", faviconDomain: "qwenlm.github.io" },
  { id: "rovo", label: "Rovo Dev", faviconDomain: "atlassian.com" },
  { id: "hermes", label: "Hermes", faviconDomain: "nousresearch.com" },
  { id: "devin", label: "Devin", faviconDomain: "devin.ai" },
  { id: "openclaw", label: "OpenClaw", faviconDomain: "openclaw.ai" },
];

export function getAgentLabel(agent: TuiAgent): string {
  return AGENT_CATALOG.find((entry) => entry.id === agent)?.label ?? agent;
}

export function AgentIcon({
  agent,
  size = 14,
}: {
  agent: TuiAgent | null | undefined;
  size?: number;
}): React.JSX.Element {
  if (!agent) {
    return <AgentLetterIcon letter="?" size={size} />;
  }
  if (agent === "claude" || agent === "claude-agent-teams") {
    return <ClaudeIcon size={size} />;
  }
  if (agent === "codex") {
    return <OpenAIIcon size={size} />;
  }
  if (agent === "droid") {
    return <DroidIcon size={size} />;
  }
  if (agent === "pi") {
    return <PiIcon size={size} />;
  }
  if (agent === "omp") {
    return <OmpIcon size={size} />;
  }
  if (agent === "aider") {
    return <AiderIcon size={size} />;
  }
  if (agent === "kilo") {
    return <KiloIcon size={size} />;
  }
  if (agent === "copilot") {
    return <CopilotIcon size={size} />;
  }
  if (agent === "opencode") {
    return <OpenCodeIcon size={size} />;
  }
  const catalogEntry = AGENT_CATALOG.find((a) => a.id === agent);
  const bundledFaviconUrl = AGENT_FAVICON_ASSETS[agent];
  const iconSrc = catalogEntry?.iconUrl ?? bundledFaviconUrl;
  if (iconSrc) {
    return (
      <img
        src={iconSrc}
        width={size}
        height={size}
        alt=""
        aria-hidden
        className="pane-tab-favicon"
      />
    );
  }
  if (catalogEntry?.faviconDomain) {
    return (
      <img
        src={`https://www.google.com/s2/favicons?domain=${catalogEntry.faviconDomain}&sz=64`}
        width={size}
        height={size}
        alt=""
        aria-hidden
        className="pane-tab-favicon"
      />
    );
  }
  const label = catalogEntry?.label ?? agent;
  return <AgentLetterIcon letter={label.charAt(0).toUpperCase()} size={size} />;
}
