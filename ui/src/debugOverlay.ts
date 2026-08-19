// Standalone debug overlay independent of the React tree — installed before
// React even starts, so it survives total render failures, infinite loops in
// effects (still logs before hanging), and errors React's own boundary can't
// catch (window.onerror, unhandled promise rejections).
// Docked to the right edge (not overlaid on top) so it never eats clicks
// meant for the app underneath, while still being a normal, selectable,
// scrollable text panel (pointer-events: auto — text needs to be
// draggable/copyable for pasting back into the debugging session).
const el = document.createElement("pre");
el.id = "debug-overlay";
el.style.cssText =
  "position:fixed;top:0;right:0;bottom:0;width:420px;z-index:999999;margin:0;padding:12px;" +
  "background:rgba(26,0,0,0.96);color:#ff6b6b;font-size:11px;white-space:pre-wrap;" +
  "overflow-y:auto;user-select:text;cursor:text;display:none;";
document.addEventListener("DOMContentLoaded", () => document.body.appendChild(el));

// Hidden by default — it's a 420px-wide panel that would otherwise sit on
// top of the pane toolbar (URL bar, back/forward buttons) and eat clicks
// meant for those. Logs still accumulate in the background; toggle with
// Ctrl+Shift+D to see them. (Cmd+Option+D collides with macOS's built-in
// Dock show/hide shortcut, so that's not usable here.)
let visible = false;
function setVisible(v: boolean) {
  visible = v;
  el.style.display = v ? "block" : "none";
}

function log(line: string) {
  el.textContent += line + "\n\n";
}

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
    setVisible(!visible);
  }
});

window.addEventListener("error", (e) => {
  log(`[window.onerror] ${e.message}\n${e.error?.stack ?? "(no stack)"}`);
});
window.addEventListener("unhandledrejection", (e) => {
  log(`[unhandledrejection] ${String(e.reason?.stack ?? e.reason)}`);
});

// WKWebView doesn't forward console output to the app's own stderr, so this
// is the only way to see it without opening Safari's Web Inspector.
const origLog = console.log.bind(console);
console.log = (...args: unknown[]) => {
  origLog(...args);
  log(`[log] ${args.map(String).join(" ")}`);
};

console.log(`[debugOverlay] installed at ${new Date().toISOString()}`);
