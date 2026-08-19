import { isTauri } from "@tauri-apps/api/core";
import { useRef } from "react";
import { CefSession, useCefSession } from "./cef/CefSession";
import { CefToolbar } from "./cef/CefToolbar";
import { PaneFrame } from "../components/PaneFrame";
import { PaneComponent } from "../layout/paneTypes";
import { Actions, TabNode } from "flexlayout-react";

interface Props {
  paneId: string;
  initialUrl?: string;
  tabNode: TabNode;
  component: PaneComponent;
  visible: boolean;
  onSplit: (mode: "split-right" | "split-down", paneType: PaneComponent) => void;
  onTypeChange: (component: PaneComponent) => void;
}

function CefBrowserPaneBody({
  component,
  contentRef,
  onSplit,
  onTypeChange,
  onClose,
}: {
  component: PaneComponent;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onSplit: Props["onSplit"];
  onTypeChange: Props["onTypeChange"];
  onClose: () => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const { url } = useCefSession();

  return (
    <PaneFrame
      ref={shellRef}
      component={component}
      toolbar={<CefToolbar />}
      contentSlot
      onSplit={onSplit}
      onTypeChange={onTypeChange}
      onClose={onClose}
    >
      {isTauri() ? (
        <div ref={contentRef} className="browser-content-slot" aria-hidden="true" />
      ) : (
        <iframe
          className="browser-content-slot"
          src={url}
          title="Browser (Chromium)"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
        />
      )}
    </PaneFrame>
  );
}

export function CefBrowserPane({
  paneId,
  initialUrl,
  tabNode,
  component,
  visible,
  onSplit,
  onTypeChange,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  const close = () => {
    tabNode.getModel().doAction(Actions.deleteTab(tabNode.getId()));
  };

  return (
    <CefSession paneId={paneId} initialUrl={initialUrl} contentRef={contentRef} visible={visible}>
      <CefBrowserPaneBody
        component={component}
        contentRef={contentRef}
        onSplit={onSplit}
        onTypeChange={onTypeChange}
        onClose={close}
      />
    </CefSession>
  );
}
