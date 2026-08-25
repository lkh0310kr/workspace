import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import type { ITerminalOptions } from "@xterm/xterm";
import type { ManagedPaneInternal, PaneManagerOptions } from "./pane-manager-types";
import { buildDefaultTerminalOptions } from "./pane-terminal-options";
import { ENABLE_WEBGL_RENDERER } from "./pane-webgl-renderer";

export function createPaneDOM(
  id: number,
  leafId: string,
  options: PaneManagerOptions,
): ManagedPaneInternal {
  const container = document.createElement("div");
  container.className = "pane pane-manager-root";
  container.dataset.paneId = String(id);
  container.dataset.leafId = leafId;

  const xtermContainer = document.createElement("div");
  xtermContainer.className = "xterm-container";
  container.appendChild(xtermContainer);

  const userOpts = options.terminalOptions?.(id) ?? {};
  const terminalOpts: ITerminalOptions = {
    ...buildDefaultTerminalOptions(),
    ...userOpts,
  };

  const terminal = new Terminal(terminalOpts);
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  const unicode11Addon = new Unicode11Addon();
  const linkTooltip = document.createElement("div");
  linkTooltip.className = "pane-link-tooltip xterm-hover";
  linkTooltip.style.display = "none";

  const webLinksAddon = new WebLinksAddon(
    options.onLinkClick ? (event, uri) => options.onLinkClick!(id, event, uri) : undefined,
    {
      hover: (_event, uri) => {
        if (uri) {
          linkTooltip.textContent = `${uri} (${options.linkOpenHint(id)})`;
          linkTooltip.style.display = "";
        }
      },
      leave: () => {
        linkTooltip.style.display = "none";
      },
    },
  );

  const pane: ManagedPaneInternal = {
    id,
    leafId,
    terminal,
    container,
    xtermContainer,
    linkTooltip,
    fitAddon,
    searchAddon,
    serializeAddon: new SerializeAddon(),
    unicode11Addon,
    webLinksAddon,
    terminalGpuAcceleration: options.terminalGpuAcceleration ?? "auto",
    gpuRenderingEnabled: ENABLE_WEBGL_RENDERER,
    webglAttachmentDeferred: options.initialRenderingSuspended === true,
    webglDisabledAfterContextLoss: false,
    webglAddon: null,
    ligaturesAddon: null,
    fitResizeObserver: null,
    pendingInitialFitRafId: null,
    pendingWebglRefreshRafId: null,
    renderingSuspended: options.initialRenderingSuspended === true,
  };

  return pane;
}
