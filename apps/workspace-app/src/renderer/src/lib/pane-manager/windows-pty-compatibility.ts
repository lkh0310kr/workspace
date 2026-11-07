import type { ITerminalOptions } from "@xterm/xterm";
import { isWslUncPath } from "./wsl-unc-path";

export type WindowsPtyCompatibilityContext = {
  userAgent?: string;
  osRelease?: string;
  cwd?: string | null;
  /** When the main process spawns `wsl.exe` for this pane's tab root. */
  shellIsWsl?: boolean;
};

function isWindowsUserAgent(userAgent: string | undefined): boolean {
  return userAgent?.includes("Windows") ?? false;
}

function isWslShellSpawn(context: WindowsPtyCompatibilityContext): boolean {
  return context.shellIsWsl === true;
}

function parseWindowsBuildNumber(osRelease: string | null | undefined): number | undefined {
  const build = osRelease?.split(".")[2];
  if (!build) return undefined;
  const parsed = Number.parseInt(build, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function buildXtermWindowsPtyOptions(
  buildNumber: number | undefined,
): NonNullable<ITerminalOptions["windowsPty"]> {
  if (buildNumber === undefined || buildNumber < 21376) {
    return { backend: "conpty" };
  }
  return { backend: "conpty", buildNumber };
}

/**
 * Whether this pane is backed by native Windows ConPTY (PowerShell/cmd), not
 * WSL guest paths or `wsl.exe` wrappers.
 */
export function isLocalNativeWindowsConpty(context: WindowsPtyCompatibilityContext): boolean {
  return (
    isWindowsUserAgent(context.userAgent) &&
    !isWslUncPath(context.cwd ?? "") &&
    !isWslShellSpawn(context)
  );
}

export function buildWindowsPtyCompatibilityOptions(
  context: WindowsPtyCompatibilityContext,
): Partial<ITerminalOptions> {
  // All Windows Electron panes use ConPTY (PowerShell, cmd, wsl.exe). xterm needs
  // windowsPty on every Windows host — not only native C:\ tab roots.
  if (!isWindowsUserAgent(context.userAgent)) {
    return {};
  }
  return { windowsPty: buildXtermWindowsPtyOptions(parseWindowsBuildNumber(context.osRelease)) };
}
