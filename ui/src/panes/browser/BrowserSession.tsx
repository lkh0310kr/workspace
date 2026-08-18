import { createContext, useContext, type ReactNode } from "react";
import { useBrowserHost } from "../../browser/useBrowserHost";

interface BrowserSessionValue {
  url: string;
  setUrl: (url: string) => void;
  frameUrl: string;
  navigate: () => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
  toggleDevtools: () => void;
  loading: boolean;
}

const BrowserSessionContext = createContext<BrowserSessionValue | null>(null);

export function useBrowserSession(): BrowserSessionValue {
  const ctx = useContext(BrowserSessionContext);
  if (!ctx) throw new Error("useBrowserSession must be used within BrowserSession");
  return ctx;
}

interface ProviderProps {
  paneId: string;
  initialUrl?: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  children: ReactNode;
}

export function BrowserSession({
  paneId,
  initialUrl,
  contentRef,
  visible,
  children,
}: ProviderProps) {
  const session = useBrowserHost({ paneId, initialUrl, contentRef, visible });

  return (
    <BrowserSessionContext.Provider value={session}>{children}</BrowserSessionContext.Provider>
  );
}
