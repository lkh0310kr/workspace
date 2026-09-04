import { useEffect, useState } from "react";

// App.tsx renders this whenever workspace:get-state hasn't resolved yet
// (or the active pane's flexlayout model isn't hydrated). Normally that's
// a few ms. If it never resolves — the known way this happens is two
// live app instances racing on the same persisted state (see
// requestSingleInstanceLock/appSupportDir's dev split in main/index.ts)
// leaving the surviving window's IPC handlers in a broken state — a bare
// spinner gives no way out short of killing the whole `npm run dev`
// process. After a few seconds, offer a same-window reload instead: it
// re-runs the whole bootstrap (initWorkspaceStore's cached promise reset
// included, since a full page reload clears all module state) without
// needing to touch the terminal.
const STUCK_AFTER_MS = 6000;

export function LoadingWorkspace() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!stuck) {
    return <div className="loading">Loading workspace…</div>;
  }

  return (
    <div className="loading loading-stuck">
      <div>Still loading — this usually means the app needs a reload.</div>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
