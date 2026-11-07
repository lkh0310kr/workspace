const APP_CONTROL_SELECTOR = [
  "input:not(.xterm-helper-textarea)",
  "textarea:not(.xterm-helper-textarea)",
  "select",
  "button",
  '[role="textbox"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[contenteditable="plaintext-only"]',
  "[data-pane-prevent-terminal-focus]",
].join(",");

/** Whether a pane pointerdown should move focus into xterm (ported from Orca). */
export function shouldFocusTerminalFromPanePointerDown(target: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(target instanceof Element)) {
    return true;
  }
  return target.closest(APP_CONTROL_SELECTOR) === null;
}
