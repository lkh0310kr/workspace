import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import PkmsClientApp from "@pkms/client/PkmsClientApp";
import pkmsStyles from "@pkms/client/styles.css?inline";

export function PkmsPane(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    // Give every effect mount a fresh host. React StrictMode and Fast Refresh can
    // replay effects on the same outer element, which cannot accept a second root.
    const mountContainer: HTMLElement | ShadowRoot = container.shadowRoot ?? container;
    const host = document.createElement("div");
    host.className = "pkms-pane-shadow-host";
    mountContainer.replaceChildren(host);
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${pkmsStyles
      .replaceAll(":root", ":host")
      .replace(/(^|,)\s*body(?=\s*[, {])/gm, "$1:host")}
:host { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.pkms-root { width: 100%; height: 100%; min-width: 0; min-height: 0; }
/* The client sizes itself to the window (100dvh); inside a pane it must fill the pane so the tree can scroll. */
.app-shell { height: 100%; }
.welcome-screen, .loading-screen { min-height: 100%; }`;
    const mount = document.createElement("div");
    mount.className = "pkms-root";
    shadow.append(style, mount);

    const root: Root = createRoot(mount);
    root.render(
      <MemoryRouter initialEntries={["/"]}>
        <PkmsClientApp />
      </MemoryRouter>,
    );

    return () => {
      root.unmount();
      host.remove();
    };
  }, []);

  return <div ref={hostRef} className="pkms-pane-host" style={{ display: "block", width: "100%", height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden" }} />;
}
