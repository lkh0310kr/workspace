import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { browserCleanupAll } from "../browser";
import { BrowserSession, useBrowserSession } from "./browser/BrowserSession";
import { BrowserToolbar } from "./browser/BrowserToolbar";
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

function BrowserPaneBody({
  component,
  tabNode,
  contentRef,
  onSplit,
  onTypeChange,
  onClose,
}: {
  component: PaneComponent;
  tabNode: TabNode;
  contentRef: React.RefObject<HTMLDivElement | null>;
  onSplit: Props["onSplit"];
  onTypeChange: Props["onTypeChange"];
  onClose: () => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const { frameUrl } = useBrowserSession();

  return (
    <PaneFrame
      ref={shellRef}
      component={component}
      tabNode={tabNode}
      toolbar={<BrowserToolbar />}
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
          src={frameUrl}
          title="Browser"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
        />
      )}
    </PaneFrame>
  );
}

export function BrowserPane({
  paneId,
  initialUrl,
  tabNode,
  component,
  visible,
  onSplit,
  onTypeChange,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void browserCleanupAll().catch(() => {});
  }, []);

  const close = () => {
    tabNode.getModel().doAction(Actions.deleteTab(tabNode.getId()));
  };

  return (
    <BrowserSession
      paneId={paneId}
      initialUrl={initialUrl}
      contentRef={contentRef}
      visible={visible}
    >
      <BrowserPaneBody
        component={component}
        tabNode={tabNode}
        contentRef={contentRef}
        onSplit={onSplit}
        onTypeChange={onTypeChange}
        onClose={close}
      />
    </BrowserSession>
  );
}
