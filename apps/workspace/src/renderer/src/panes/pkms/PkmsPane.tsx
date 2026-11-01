import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";
import PkmsClientApp from "@pkms/client/PkmsClientApp";
import pkmsStyles from "@pkms/client/styles.css?inline";

export function PkmsPane(): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `${pkmsStyles
      .replaceAll(":root", ":host")
      .replace(/(^|,)\s*body(?=\s*[, {])/gm, "$1:host")}
:host { display: block; width: 100%; height: 100%; min-width: 0; min-height: 0; overflow: hidden; }
.pkms-root { width: 100%; height: 100%; min-width: 0; min-height: 0; }`;
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
      shadow.replaceChildren();
    };
  }, []);

  return <div ref={hostRef} className="pkms-pane-host" />;
}
