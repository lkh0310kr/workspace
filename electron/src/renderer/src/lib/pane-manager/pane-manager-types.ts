import type { FitAddon } from "@xterm/addon-fit";
import type { LigaturesAddon } from "@xterm/addon-ligatures";
import type { SearchAddon } from "@xterm/addon-search";
import type { SerializeAddon } from "@xterm/addon-serialize";
import type { Unicode11Addon } from "@xterm/addon-unicode11";
import type { WebLinksAddon } from "@xterm/addon-web-links";
import type { WebglAddon } from "@xterm/addon-webgl";
import type { Terminal, ITerminalOptions, IMarker, IDisposable } from "@xterm/xterm";

export type TerminalGpuAcceleration = "auto" | "on" | "off";

export type ScrollState = {
  bufferType: "normal" | "alternate";
  wasAtBottom: boolean;
  viewportY: number;
  baseY: number;
  firstVisibleLineMarker?: IMarker;
  firstVisibleLogicalLineMarker?: IMarker;
  firstVisibleLogicalCellOffset?: number;
};

export type ManagedPane = {
  id: number;
  leafId: string;
  terminal: Terminal;
  container: HTMLElement;
  linkTooltip: HTMLElement;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  serializeAddon: SerializeAddon;
};

export type ManagedPaneInternal = ManagedPane & {
  xtermContainer: HTMLElement;
  terminalGpuAcceleration: TerminalGpuAcceleration;
  gpuRenderingEnabled: boolean;
  webglAttachmentDeferred: boolean;
  webglDisabledAfterContextLoss: boolean;
  webglAttachFailedSinceRecovery?: boolean;
  webglAddon: WebglAddon | null;
  ligaturesAddon: LigaturesAddon | null;
  unicode11Addon: Unicode11Addon;
  webLinksAddon: WebLinksAddon;
  fitResizeObserver: ResizeObserver | null;
  lastFitClientSize?: { width: number; height: number };
  pendingInitialFitRafId: number | null;
  pendingWebglRefreshRafId: number | null;
  pendingRefitRetryRafId: number | null;
  renderingSuspended: boolean;
  lastFitCols: number;
  lastFitRows: number;
  webglNeedsRebuildOnResume: boolean;
  webglRebuildDeferred?: boolean;
  hasComplexScriptOutput?: boolean;
  compositionHandler: (() => void) | null;
  focusClassSyncCleanup: (() => void) | null;
  terminalScrollIntentDisposable: IDisposable | null;
  wheelScrollCleanup: (() => void) | null;
  linkifierHoverResetDisposable: { dispose: () => void } | null;
  linkifierMouseLeaveResetDisposable: { dispose: () => void } | null;
  linkifierWindowBlurResetDisposable: { dispose: () => void } | null;
  pendingSplitScrollState: ScrollState | null;
};

export type PaneManagerOptions = {
  onPaneCreated?: (pane: ManagedPane) => void | Promise<void>;
  onActivePaneChange?: (pane: ManagedPane) => void;
  terminalOptions?: (paneId: number) => Partial<ITerminalOptions>;
  onLinkClick?: (paneId: number, event: MouseEvent | undefined, url: string) => void;
  linkOpenHint: (paneId: number) => string;
  initialRenderingSuspended?: boolean;
  terminalGpuAcceleration?: TerminalGpuAcceleration;
  debugLabel?: string;
};
