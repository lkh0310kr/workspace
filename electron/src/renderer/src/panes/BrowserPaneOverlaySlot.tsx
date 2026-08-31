import { memo, useCallback } from "react";
import { registerBrowserOverlaySlotViewport } from "../browser/browserPageViewport";

type Props = {
  paneNodeId: string;
  paneVisible: boolean;
  onFocusOwningGroup: () => void;
  children: React.ReactNode;
};

// Orca parity — BrowserPaneOverlayLayer BrowserOverlaySlot: slot root + BrowserPane chrome as siblings.
export const BrowserPaneOverlaySlot = memo(function BrowserPaneOverlaySlot({
  paneNodeId,
  paneVisible,
  onFocusOwningGroup,
  children,
}: Props): React.JSX.Element | null {
  const setSlotViewportRef = useCallback(
    (node: HTMLDivElement | null): void => {
      registerBrowserOverlaySlotViewport(paneNodeId, node);
    },
    [paneNodeId],
  );
  const handleFocus = useCallback(() => {
    onFocusOwningGroup();
  }, [onFocusOwningGroup]);

  return (
    <div
      className="browser-pane-overlay-slot"
      data-browser-overlay-pane-id={paneNodeId}
      style={{ display: paneVisible ? "flex" : "none" }}
      onPointerDown={handleFocus}
      onFocusCapture={handleFocus}
    >
      <div ref={setSlotViewportRef} className="browser-overlay-slot-root" />
      {children}
    </div>
  );
});
