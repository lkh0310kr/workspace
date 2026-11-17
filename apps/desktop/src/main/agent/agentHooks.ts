import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { appSupportDir } from '../workspace/persistence'

// Codex CLI does not put a working/idle spinner in the terminal
// title (Claude Code does), so title-derived status can't see it. It supports lifecycle hooks, so we install a small script into its global
// hook configs that POSTs the state to the workspace hook server
// (WORKSPACE_AGENT_HOOK_URL / WORKSPACE_TERMINAL_ID come from the PTY env).

const HOOK_SCRIPT_NAME = 'agent-status-hook.sh'

const HOOK_SCRIPT = `#!/bin/sh
# usage: agent-status-hook.sh
payload=$({ command -p cat 2>/dev/null || cat; })
event=$(printf '%s' "$payload" | sed -n 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"\\([A-Za-z]*\\)".*/\\1/p' | head -n 1)

[ -n "\${WORKSPACE_AGENT_HOOK_URL:-}" ] || exit 0
[ -n "\${WORKSPACE_TERMINAL_ID:-}" ] || exit 0

case "$event" in
  UserPromptSubmit|PreToolUse|PostToolUse)
    state=working ;;
  PermissionRequest) state=waiting ;;
  Stop|stop) state=done ;;
  *) exit 0 ;;
esac

curl -sS -X POST "$WORKSPACE_AGENT_HOOK_URL" \\
  --connect-timeout 0.5 --max-time 1.5 \\
  -H "Content-Type: application/json" \\
  -d "{\\"terminalId\\":$WORKSPACE_TERMINAL_ID,\\"state\\":\\"$state\\",\\"agentType\\":\\"codex\\"}" \\
  >/dev/null 2>&1 || :
exit 0
`

type JsonObject = Record<string, unknown>

function readJson(file: string): JsonObject | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as JsonObject)
      : null
  } catch {
    return null
  }
}

function writeJson(file: string, value: JsonObject): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

function hasCommand(entries: unknown, command: string): boolean {
  return JSON.stringify(entries ?? []).includes(command)
}

function installCodexHooks(scriptPath: string): void {
  const file = path.join(os.homedir(), '.codex', 'hooks.json')
  const config = readJson(file) ?? {}
  const command = `/bin/sh ${JSON.stringify(scriptPath)}`
  const events = ['UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'Stop']
  let changed = false
  for (const event of events) {
    const entries = Array.isArray(config[event]) ? (config[event] as unknown[]) : []
    if (hasCommand(entries, scriptPath)) continue
    entries.push({ hooks: [{ type: 'command', command, timeout: 10 }] })
    config[event] = entries
    changed = true
  }
  if (changed) writeJson(file, config)
}

/** Best-effort, idempotent; never throws (a bad user config must not block startup). */
export function installAgentStatusHooks(): void {
  try {
    const dir = path.join(appSupportDir(), 'agent-hooks')
    fs.mkdirSync(dir, { recursive: true })
    const scriptPath = path.join(dir, HOOK_SCRIPT_NAME)
    fs.writeFileSync(scriptPath, HOOK_SCRIPT)
    fs.chmodSync(scriptPath, 0o755)
    installCodexHooks(scriptPath)
  } catch (err) {
    console.error('[agent-hooks] install failed:', err)
  }
}
