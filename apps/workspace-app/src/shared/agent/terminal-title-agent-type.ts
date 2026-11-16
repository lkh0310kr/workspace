import { titleHasAgentName } from './agent-name-token-match'
import { containsAgentSpinnerGlyph } from './agent-title-core'
import { getAgentLabel } from './agent-title-identity'
import type { TuiAgent } from './tui-agent'

export {
  CLAUDE_IDLE,
  GEMINI_IDLE,
  GEMINI_PERMISSION,
  GEMINI_SILENT_WORKING,
  GEMINI_WORKING,
  isClaudeIdentityFrameTitle,
  isClaudeManagementTitle,
  isGeminiTerminalTitle,
  isPiAgentTitle
} from './agent-title-core'
export { getAgentLabel, isClaudeAgent } from './agent-title-identity'

// Why: Grok Build uses a fixed spinner/phrase/identity frame. Requiring both
// delimiters avoids treating another agent's task text as a Grok working title.
const GROK_ROTATING_FRAME_RE = /^[\u2800-\u28FF]+\s+-\s+[\s\S]+?\s-\s+grok\s*$/i
const GROK_COLLAPSED_WORKING_TITLE_RE = /^[\u2800-\u28FF]+\s+grok\s*$/i

export function containsBrailleSpinner(title: string): boolean {
  for (const char of title) {
    const codePoint = char.codePointAt(0)
    if (codePoint !== undefined && codePoint >= 0x2800 && codePoint <= 0x28ff) {
      return true
    }
  }
  return false
}

export function isGrokRotatingWorkingTitle(title: string): boolean {
  if (!containsBrailleSpinner(title)) {
    return false
  }
  return GROK_ROTATING_FRAME_RE.test(title) || GROK_COLLAPSED_WORKING_TITLE_RE.test(title)
}

const TITLE_LABEL_TO_AGENT: Partial<Record<string, TuiAgent>> = {
  'Claude Code': 'claude',
  OpenClaude: 'openclaude',
  Codex: 'codex',
  'Gemini CLI': 'gemini',
  'GitHub Copilot': 'copilot',
  Grok: 'grok',
  Devin: 'devin',
  Antigravity: 'antigravity',
  OpenCode: 'opencode',
  'MiMo Code': 'mimo-code',
  Aider: 'aider',
  Cursor: 'cursor',
  Droid: 'droid',
  Hermes: 'hermes',
  Pi: 'pi',
  OMP: 'omp'
}

function hasGenericClaudeStatusPrefix(title: string): boolean {
  return (
    containsAgentSpinnerGlyph(title) ||
    title.startsWith('✳ ') ||
    title === '✳' ||
    title.startsWith('. ') ||
    title.startsWith('* ')
  )
}

function isGenericClaudeStatusClaim(title: string, titleAgent: TuiAgent | null): boolean {
  return (
    titleAgent === 'claude' &&
    hasGenericClaudeStatusPrefix(title) &&
    !titleHasAgentName(title, 'claude')
  )
}

export function resolveTerminalTitleAgentType(title: string): TuiAgent | null {
  const label = getAgentLabel(title)
  return label ? (TITLE_LABEL_TO_AGENT[label] ?? null) : null
}

/**
 * Resolve a terminal title's agent identity, but treat Claude's bare status
 * prefixes (spinner / "✳" / ". " / "* ") as activity-only. They indicate that
 * something is running, not that the agent is Claude.
 */
export function resolveExplicitTerminalTitleAgentType(title: string): TuiAgent | null {
  const titleAgent = resolveTerminalTitleAgentType(title)
  if (isGenericClaudeStatusClaim(title, titleAgent)) {
    return null
  }
  return titleAgent
}
