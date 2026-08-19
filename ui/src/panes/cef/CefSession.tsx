import { createContext, useContext, type ReactNode } from "react";
import { useCefBrowserHost } from "../../browser/useCefBrowserHost";

interface CefSessionValue {
  url: string;
  setUrl: (url: string) => void;
  navigate: () => void;
  back: () => void;
  forward: () => void;
  reload: () => void;
  toggleDevtools: () => void;
  progress: number | null;
  canGoBack: boolean;
  canGoForward: boolean;
}

const CefSessionContext = createContext<CefSessionValue | null>(null);

export function useCefSession(): CefSessionValue {
  const ctx = useContext(CefSessionContext);
  if (!ctx) throw new Error("useCefSession must be used within CefSession");
  return ctx;
}

interface ProviderProps {
  paneId: string;
  initialUrl?: string;
  contentRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  children: ReactNode;
}

export function CefSession({ paneId, initialUrl, contentRef, visible, children }: ProviderProps) {
  const session = useCefBrowserHost({ paneId, initialUrl, contentRef, visible });

  return <CefSessionContext.Provider value={session}>{children}</CefSessionContext.Provider>;
}
