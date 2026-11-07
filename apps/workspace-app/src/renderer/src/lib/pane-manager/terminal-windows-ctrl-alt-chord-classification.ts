import type { Terminal } from "@xterm/xterm";

// xterm misclassifies Windows Ctrl+Alt chords as AltGr and drops them (#8734).
type ThirdLevelShiftBrowserInfo = { isWindows?: boolean };

type ThirdLevelShiftKeyboardEvent = Pick<KeyboardEvent, "ctrlKey" | "altKey" | "metaKey"> & {
  getModifierState?: (keyArg: string) => boolean;
};

type TerminalWithThirdLevelShift = {
  _core?: {
    _isThirdLevelShift?: (
      browser: ThirdLevelShiftBrowserInfo,
      event: ThirdLevelShiftKeyboardEvent,
    ) => boolean;
  };
};

export function isGenuineWindowsCtrlAltChord(event: ThirdLevelShiftKeyboardEvent): boolean {
  return (
    event.ctrlKey && event.altKey && !event.metaKey && event.getModifierState?.("AltGraph") !== true
  );
}

export function shouldRepairWindowsCtrlAltChords(userAgent: string): boolean {
  return userAgent.includes("Windows") && userAgent.includes("Chrome/");
}

export function installWindowsCtrlAltChordRepair(
  terminal: Terminal,
  userAgent: string = navigator.userAgent,
): boolean {
  if (!shouldRepairWindowsCtrlAltChords(userAgent)) {
    return false;
  }
  const core = (terminal as unknown as TerminalWithThirdLevelShift)._core;
  const stockClassification = core?._isThirdLevelShift;
  if (!core || typeof stockClassification !== "function") {
    return false;
  }
  core._isThirdLevelShift = function (browser, event) {
    const thirdLevel = stockClassification.call(this, browser, event);
    if (!thirdLevel || browser?.isWindows !== true) {
      return thirdLevel;
    }
    return !isGenuineWindowsCtrlAltChord(event);
  };
  return true;
}
