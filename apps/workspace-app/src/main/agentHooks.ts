import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { appSupportDir } from "./persistence";

// Codex CLI and Cursor CLI never put a working/idle spinner in the terminal
// title (Claude Code does), so title-derived status can't see them. Both
// support lifecycle hooks, so we install a small script into their global
// hook configs that POSTs the state to the workspace hook server
// (WORKSPACE_AGENT_HOOK_URL / WORKSPACE_TERMINAL_ID come from the PTY env).

const HOOK_SCRIPT_NAME = "agent-status-hook.sh";

const HOOK_SCRIPT = `#!/bin/sh
# usage: agent-status-hook.sh <codex|cursor>
agent="$1"
payload=$({ command -p cat 2>/dev/null || cat; })
event=$(printf '%s' "$payload" | sed -n 's/.*"hook_event_name"[[:space:]]*:[[:space:]]*"\\([A-Za-z]*\\)".*/\\1/p' | head -n 1)

# Cursor blocks on the hook's stdout, so always answer before doing anything else.
if [ "$agent" = "cursor" ]; then
  case "$event" in
    beforeSubmitPrompt) printf '{"continue":true}\\n' ;;
    preToolUse|beforeShellExecution|beforeMCPExecution) printf '{"permission":"allow"}\\n' ;;
    *) printf '{}\\n' ;;
  esac
fi

[ -n "\${WORKSPACE_AGENT_HOOK_URL:-}" ] || exit 0
[ -n "\${WORKSPACE_TERMINAL_ID:-}" ] || exit 0

case "$event" in
  UserPromptSubmit|PreToolUse|PostToolUse|PostToolUseFailure|beforeSubmitPrompt|preToolUse|postToolUse|postToolUseFailure|beforeShellExecution|beforeMCPExecution)
    state=working ;;
  PermissionRequest) state=waiting ;;
  Stop|stop) state=done ;;
  *) exit 0 ;;
esac

curl -sS -X POST "$WORKSPACE_AGENT_HOOK_URL" \\
  --connect-timeout 0.5 --max-time 1.5 \\
  -H "Content-Type: application/json" \\
  -d "{\\"terminalId\\":$WORKSPACE_TERMINAL_ID,\\"state\\":\\"$state\\",\\"agentType\\":\\"$agent\\"}" \\
  >/dev/null 2>&1 || :
exit 0
`;

type JsonObject = Record<string, unknown>;

function readJson(file: string): JsonObject | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as JsonObject) : null;
  } catch {
    return null;
  }
}

function writeJson(file: string, value: JsonObject): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function hasCommand(entries: unknown, command: string): boolean {
  return JSON.stringify(entries ?? []).includes(command);
}

function installCodexHooks(scriptPath: string): void {
  const file = path.join(os.homedir(), ".codex", "hooks.json");
  const config = readJson(file) ?? {};
  const command = `/bin/sh ${JSON.stringify(scriptPath)} codex`;
  const events = ["UserPromptSubmit", "PreToolUse", "PermissionRequest", "PostToolUse", "Stop"];
  let changed = false;
  for (const event of events) {
    const entries = Array.isArray(config[event]) ? (config[event] as unknown[]) : [];
    if (hasCommand(entries, scriptPath)) continue;
    entries.push({ hooks: [{ type: "command", command, timeout: 10 }] });
    config[event] = entries;
    changed = true;
  }
  if (changed) writeJson(file, config);
}

function installCursorHooks(scriptPath: string): void {
  const file = path.join(os.homedir(), ".cursor", "hooks.json");
  const config = readJson(file) ?? {};
  const command = `/bin/sh ${JSON.stringify(scriptPath)} cursor`;
  const events = [
    "beforeSubmitPrompt",
    "preToolUse",
    "postToolUse",
    "postToolUseFailure",
    "beforeShellExecution",
    "beforeMCPExecution",
    "stop",
  ];
  let changed = false;
  if (typeof config.version !== "number") {
    config.version = 1;
    changed = true;
  }
  // Cursor keeps its events under a top-level "hooks" map.
  const hooks = (config.hooks && typeof config.hooks === "object" ? config.hooks : {}) as JsonObject;
  for (const event of events) {
    const entries = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    if (hasCommand(entries, scriptPath)) continue;
    entries.push({ command, timeout: 10 });
    hooks[event] = entries;
    changed = true;
  }
  config.hooks = hooks;
  if (changed) writeJson(file, config);
}

/** Best-effort, idempotent; never throws (a bad user config must not block startup). */
export function installAgentStatusHooks(): void {
  try {
    const dir = path.join(appSupportDir(), "agent-hooks");
    fs.mkdirSync(dir, { recursive: true });
    const scriptPath = path.join(dir, HOOK_SCRIPT_NAME);
    fs.writeFileSync(scriptPath, HOOK_SCRIPT);
    fs.chmodSync(scriptPath, 0o755);
    installCodexHooks(scriptPath);
    installCursorHooks(scriptPath);
  } catch (err) {
    console.error("[agent-hooks] install failed:", err);
  }
}
