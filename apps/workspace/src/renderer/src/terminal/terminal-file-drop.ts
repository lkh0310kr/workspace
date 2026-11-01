import type { TuiAgent } from "../../../shared/agent/tui-agent";

export const TERMINAL_FILE_DROP_EVENT = "workspace-terminal-file-drop";

export function formatDroppedPaths(paths: string[], agent?: TuiAgent | null): string {
  const safePaths = paths.filter((path) => path.length > 0 && !/[\r\n\0]/.test(path));
  if (agent === "codex") {
    return safePaths.map((path) => `file://${path.split("/").map(encodeURIComponent).join("/")}`).join(" ");
  }

  return safePaths
    .map((path) => `'${path.replaceAll("'", "'\\''")}'`)
    .join(" ");
}

export function installTerminalFileDropHandler(args: {
  container: HTMLElement;
  focus: () => void;
  write: (text: string) => void;
  getTerminalAgent: () => TuiAgent | null | undefined;
}): () => void {
  const onDrop = (event: Event): void => {
    const paths = (event as CustomEvent<{ paths?: unknown }>).detail?.paths;
    if (!Array.isArray(paths) || !paths.every((path) => typeof path === "string")) return;

    const text = formatDroppedPaths(paths, args.getTerminalAgent());
    if (!text) return;

    event.preventDefault();
    args.focus();
    args.write(text);
  };

  args.container.addEventListener(TERMINAL_FILE_DROP_EVENT, onDrop);
  return () => args.container.removeEventListener(TERMINAL_FILE_DROP_EVENT, onDrop);
}
