import { useEffect, useState } from "react";
import type { EditorDocumentSession, EditorDocumentSnapshot } from "./provider";

/** Subscribe React UI to the provider-owned document snapshot. */
export function useEditorDocumentSnapshot(session: EditorDocumentSession | null | undefined): EditorDocumentSnapshot | null {
  const [snapshot, setSnapshot] = useState<EditorDocumentSnapshot | null>(() => session?.snapshot() ?? null);
  useEffect(() => {
    if (!session) {
      setSnapshot(null);
      return;
    }
    setSnapshot(session.snapshot());
    return session.subscribe(setSnapshot);
  }, [session]);
  return snapshot;
}
