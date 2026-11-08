import { useEffect, useState } from "react";
import type { EditorDocumentSession, EditorDocumentSnapshot } from "./provider";

/** Subscribe React UI to the provider-owned document snapshot. */
export function useEditorDocumentSnapshot(session: EditorDocumentSession | null | undefined): EditorDocumentSnapshot | null {
  const [current, setCurrent] = useState(() => ({
    session,
    snapshot: session?.snapshot() ?? null,
  }));
  // A new session must be visible in the render that receives it. Waiting for
  // the subscription effect would expose the previous document's snapshot for
  // one render and can restore that text under the new document identity.
  const snapshot = current.session === session
    ? current.snapshot
    : session?.snapshot() ?? null;

  useEffect(() => {
    if (!session) {
      setCurrent({ session, snapshot: null });
      return;
    }

    const publish = (next: EditorDocumentSnapshot) => setCurrent({ session, snapshot: next });
    publish(session.snapshot());
    return session.subscribe(publish);
  }, [session]);

  return snapshot;
}
