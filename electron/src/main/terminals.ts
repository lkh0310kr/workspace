import { Pty } from "./pty";

// Port of workspace-core's Workspace terminal bookkeeping (spawn_terminal /
// terminal_write / terminal_resize) — a simple id -> Pty map. No
// persistence/tab-restore logic here yet (that's workspace state, ported
// separately); this module only owns the PTY lifecycle itself.

let nextId = 1;
const terminals = new Map<number, Pty>();

export function spawnTerminal(
  cols: number,
  rows: number,
  cwd: string | undefined,
  onData: (data: Buffer) => void,
): number {
  const id = nextId++;
  // `workspace-term-<id>` — same session-key convention as the Rust
  // version (see terminal/session.rs), so a terminal reattaches to its
  // own previous tmux session rather than a stranger's, once ids are
  // restored from persisted workspace state instead of freshly assigned.
  const pty = new Pty({ cols, rows, cwd, sessionKey: `workspace-term-${id}` });
  terminals.set(id, pty);
  pty.onData(onData);
  pty.start();
  return id;
}

export function writeTerminal(id: number, data: Buffer): void {
  terminals.get(id)?.write(data);
}

export function resizeTerminal(id: number, cols: number, rows: number): void {
  terminals.get(id)?.resize(cols, rows);
}

export function disposeTerminal(id: number): void {
  const pty = terminals.get(id);
  if (!pty) return;
  pty.dispose();
  terminals.delete(id);
}

export function disposeAllTerminals(): void {
  for (const pty of terminals.values()) pty.dispose();
  terminals.clear();
}
