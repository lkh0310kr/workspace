export function attachDomRendererFocusClassSync(
  terminalElement: HTMLElement | undefined,
): () => void {
  if (!terminalElement) {
    return () => undefined;
  }

  const sync = (): void => {
    const rows = terminalElement.querySelector<HTMLElement>(".xterm-rows");
    if (!rows) {
      return;
    }
    rows.classList.toggle("xterm-focus", terminalElement.classList.contains("focus"));
  };

  const scheduleSync = (): void => {
    sync();
    requestAnimationFrame(sync);
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(terminalElement, { attributes: true, attributeFilter: ["class"] });
  terminalElement.addEventListener("focusin", scheduleSync);
  terminalElement.addEventListener("focusout", scheduleSync);
  scheduleSync();

  return () => {
    observer.disconnect();
    terminalElement.removeEventListener("focusin", scheduleSync);
    terminalElement.removeEventListener("focusout", scheduleSync);
  };
}
