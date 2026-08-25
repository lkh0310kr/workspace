import type { ManagedPane, ManagedPaneInternal, PaneManagerOptions } from "./pane-manager-types";
import { createPaneDOM, disposePane, openTerminal } from "./pane-lifecycle";
import { resumePaneRendering, suspendPaneRendering } from "./pane-rendering-control";
import { refitPaneTerminal } from "./pane-terminal-refit";

const FIRST_PANE_ID = 1;

export class SingleLeafPaneManager {
  private root: HTMLElement;
  private options: PaneManagerOptions;
  private pane: ManagedPaneInternal | null = null;
  private nextPaneId = FIRST_PANE_ID;
  private destroyed = false;

  constructor(root: HTMLElement, options: PaneManagerOptions) {
    this.root = root;
    this.options = options;
  }

  createInitialPane(opts?: { focus?: boolean; leafId?: string }): ManagedPane {
    if (this.destroyed) throw new Error("PaneManager destroyed");
    const id = this.nextPaneId++;
    const leafId = opts?.leafId ?? `leaf-${id}`;
    const pane = createPaneDOM(id, leafId, this.options);
    Object.assign(pane.container.style, {
      width: "100%",
      height: "100%",
      position: "relative",
      overflow: "hidden",
    });
    this.root.appendChild(pane.container);
    this.pane = pane;
    openTerminal(pane);
    if (opts?.focus !== false) pane.terminal.focus();
    void this.options.onPaneCreated?.(pane);
    return pane;
  }

  getPane(): ManagedPane | null {
    return this.pane;
  }

  setRenderingSuspended(suspended: boolean): void {
    if (!this.pane) return;
    if (suspended) {
      suspendPaneRendering(this.pane);
    } else {
      resumePaneRendering(this.pane);
      refitPaneTerminal(this.pane);
    }
  }

  refit(): boolean {
    if (!this.pane) return false;
    return refitPaneTerminal(this.pane);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.pane) {
      disposePane(this.pane);
      this.pane.container.remove();
      this.pane = null;
    }
  }
}
