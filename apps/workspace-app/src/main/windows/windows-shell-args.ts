import { win32 as pathWin32 } from "node:path";
import { parseWslUncPath } from "../wslPaths";
import {
  buildWslExecArgs,
  buildWslInteractiveLoginShellCommand,
  quotePosixShell,
} from "./wsl-login-shell-command";
import { encodePowerShellCommand } from "./powershell-encoding";
import {
  getPowerShellOsc133Bootstrap,
  getPowerShellRestoreCwdCommand,
} from "./powershell-bootstrap";

const CMD_EXE_COMMAND_LINE_MAX_CHARS = 8191;
const STARTUP_COMMAND_TEXT_MAX_CHARS = 6000;
const POWERSHELL_ENCODED_COMMAND_ARG_MAX_CHARS = 28_000;
const CMD_UTF8_SETUP_COMMAND = "chcp 65001 > nul";

export type WindowsShellLaunchArgs = {
  shellArgs: string[];
  startupCommandDeliveredInShellArgs?: boolean;
  effectiveCwd: string;
  validationCwd: string;
};

export type WindowsShellWslContext = {
  distro: string;
  treatPosixCwdAsWsl?: boolean;
};

function getCmdShellArgStartupCommand(command?: string): string | null {
  if (!command || command.length > STARTUP_COMMAND_TEXT_MAX_CHARS) {
    return null;
  }
  if (command.includes('"')) {
    return null;
  }
  const commandArg = `${CMD_UTF8_SETUP_COMMAND} & ${command}`;
  if (commandArg.length > CMD_EXE_COMMAND_LINE_MAX_CHARS) {
    return null;
  }
  return command;
}

function getPowerShellEncodedCommand(
  cwd: string,
  startupCommand?: string,
): {
  encodedCommand: string;
  startupCommandDeliveredInShellArgs?: boolean;
} {
  const bootstrap = `${getPowerShellOsc133Bootstrap()}${getPowerShellRestoreCwdCommand(cwd)}`;
  if (!startupCommand || startupCommand.length > STARTUP_COMMAND_TEXT_MAX_CHARS) {
    return { encodedCommand: encodePowerShellCommand(bootstrap) };
  }

  const command = `${bootstrap}\n${startupCommand}`;
  const encodedCommand = encodePowerShellCommand(command);
  if (encodedCommand.length > POWERSHELL_ENCODED_COMMAND_ARG_MAX_CHARS) {
    return { encodedCommand: encodePowerShellCommand(bootstrap) };
  }

  return {
    encodedCommand,
    startupCommandDeliveredInShellArgs: true,
  };
}

function buildWslShellArgs(linuxCwd: string, distro?: string): string[] {
  const setupCommand = [
    `cd ${quotePosixShell(linuxCwd)}`,
    'export PATH="$HOME/.local/bin:$PATH"',
    buildWslInteractiveLoginShellCommand(),
  ].join(" && ");
  return buildWslExecArgs(["sh", "-c", setupCommand], distro);
}

function toLinuxPath(windowsPath: string): string {
  const normalized = windowsPath.replace(/\\/g, "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (!match) {
    return "/mnt/c";
  }
  const rest = match[2].replace(/\/+$/, "");
  return rest ? `/mnt/${match[1].toLowerCase()}/${rest}` : `/mnt/${match[1].toLowerCase()}`;
}

/** Converts an MSYS drive spelling to the native cwd used by Windows terminal processes. */
export function normalizeWindowsTerminalCwd(cwd: string): string {
  const match = cwd.match(/^\/([A-Za-z])(?:\/(.*))?$/);
  if (!match) {
    return cwd;
  }

  const driveLetter = match[1].toUpperCase();
  const rest = match[2]?.replace(/\//g, "\\") ?? "";
  return rest ? `${driveLetter}:\\${rest}` : `${driveLetter}:\\`;
}

/** Build the argv + effective cwd for a Windows shell launch (ported from Orca). */
export function resolveWindowsShellLaunchArgs(
  shellPath: string,
  cwd: string,
  defaultCwd: string,
  wslContext?: WindowsShellWslContext,
  startupCommand?: string,
): WindowsShellLaunchArgs {
  const shellBasename = pathWin32.basename(shellPath).toLowerCase();
  const nativeCwd = normalizeWindowsTerminalCwd(cwd);

  if (shellBasename === "cmd.exe") {
    const shellArgStartupCommand = getCmdShellArgStartupCommand(startupCommand);
    const startupCommands = [
      CMD_UTF8_SETUP_COMMAND,
      ...(shellArgStartupCommand ? [shellArgStartupCommand] : []),
    ];
    return {
      shellArgs: ["/K", startupCommands.join(" & ")],
      ...(shellArgStartupCommand ? { startupCommandDeliveredInShellArgs: true } : {}),
      effectiveCwd: nativeCwd,
      validationCwd: nativeCwd,
    };
  }

  if (shellBasename === "powershell.exe" || shellBasename === "pwsh.exe") {
    const powerShellCommand = getPowerShellEncodedCommand(nativeCwd, startupCommand);
    return {
      shellArgs: ["-NoLogo", "-NoExit", "-EncodedCommand", powerShellCommand.encodedCommand],
      ...(powerShellCommand.startupCommandDeliveredInShellArgs
        ? { startupCommandDeliveredInShellArgs: true }
        : {}),
      effectiveCwd: nativeCwd,
      validationCwd: nativeCwd,
    };
  }

  if (shellBasename === "wsl.exe") {
    const wslInfo = parseWslUncPath(cwd);
    if (wslInfo) {
      return {
        shellArgs: buildWslShellArgs(wslInfo.linuxPath, wslInfo.distro),
        effectiveCwd: defaultCwd,
        validationCwd: cwd,
      };
    }
    if (wslContext?.treatPosixCwdAsWsl && cwd.startsWith("/")) {
      const validationCwd = `\\\\wsl.localhost\\${wslContext.distro}\\${cwd.replace(/^\//, "").replace(/\//g, "\\")}`;
      return {
        shellArgs: buildWslShellArgs(cwd, wslContext.distro),
        effectiveCwd: defaultCwd,
        validationCwd,
      };
    }
    const driveMatch = nativeCwd.replace(/\\/g, "/").match(/^([A-Za-z]):\/?(.*)$/);
    const linuxCwd = driveMatch ? toLinuxPath(nativeCwd) : "/mnt/c";
    return {
      shellArgs: buildWslShellArgs(linuxCwd, wslContext?.distro),
      effectiveCwd: defaultCwd,
      validationCwd: nativeCwd,
    };
  }

  return {
    shellArgs: [],
    effectiveCwd: nativeCwd,
    validationCwd: nativeCwd,
  };
}
