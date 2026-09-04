import { useEffect, useState } from "react";
import { onHtmlFullscreenChanged } from "../electron";

/** True while a <webview> guest's own content is in the Fullscreen API's
 * fullscreen state (Godot's Web export ships an in-canvas fullscreen
 * button that triggers this, same as any browser game) — drives hiding
 * this app's own chrome (App.tsx's "html-fullscreen" class) so a hosted
 * game gets genuinely full-bleed screen space instead of our titlebar/
 * nav-bar staying visible around it. Ported from itch.io's desktop
 * client (ref-proj/itch) — see main/index.ts's matching comment. */
export function useHtmlFullscreen(): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => onHtmlFullscreenChanged(setActive), []);
  return active;
}
