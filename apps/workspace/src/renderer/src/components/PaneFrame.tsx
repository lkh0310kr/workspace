import { forwardRef, type ReactNode } from "react";

// Outer chrome shared by every pane now that PaneTabStrip (not this
// component) owns the header — every pane kind gets the same two rows:
// tab strip, then a body that mounts every open tab's content
// simultaneously (hidden unless active — see PaneGroup.tsx) so state
// (terminal scrollback, browser page, unsaved editor draft) survives
// switching away and back. Kind-specific secondary chrome (the browser
// pane's own nav+address bar row) now lives inside that kind's own content
// component instead of a toolbar slot here — previously this special-cased
// a merged "contentSlot" layout for the browser pane only, and a
// hideHeader mode for the editor pane (which drew its own header
// internally); both are gone now that every pane's header is the same
// shared tab strip.
interface Props {
  header: ReactNode;
  children?: ReactNode;
}

export const PaneFrame = forwardRef<HTMLDivElement, Props>(function PaneFrame({ header, children }, ref) {
  return (
    <div className="pane-shell" ref={ref}>
      {header}
      <div className="pane-body pane-body-fill">{children}</div>
    </div>
  );
});
