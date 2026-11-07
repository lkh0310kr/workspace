/**
 * Move keyboard focus into the xterm helper textarea after React commits the
 * pane. Double-rAF avoids focusing before `.xterm-helper-textarea` exists.
 */
export function focusTerminalTextarea(container: HTMLElement | null): void {
  if (!container) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const helper = container.querySelector(".xterm-helper-textarea") as HTMLElement | null;
      helper?.focus();
    });
  });
}
