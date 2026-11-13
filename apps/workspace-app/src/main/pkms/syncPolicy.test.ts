import { describe, expect, it } from "vitest";
import { nextGuardedFolderDeleteRevision, remoteChangedSinceBaseline } from "./syncPolicy";

describe("PKMS sync race policy", () => {
  it("restores the remote item when a local deletion raced with a newer cloud revision", () => {
    expect(remoteChangedSinceBaseline({ id: "file-1", revision: 12 }, { fileId: "file-1", revision: 11 })).toBe(true);
  });

  it("restores the remote item when the same path now belongs to a different file identity", () => {
    expect(remoteChangedSinceBaseline({ id: "file-2", revision: 11 }, { fileId: "file-1", revision: 11 })).toBe(true);
  });

  it("allows a local deletion only while the cloud identity and revision match its baseline", () => {
    expect(remoteChangedSinceBaseline({ id: "file-1", revision: 11 }, { fileId: "file-1", revision: 11 })).toBe(false);
  });

  it("advances the base revision between sibling folder deletions in one pass", () => {
    const queuedAt = 1794;
    const firstDeleteAcceptedAt = 1795;
    expect(nextGuardedFolderDeleteRevision(firstDeleteAcceptedAt, queuedAt)).toBe(1795);
  });

  it("never regresses behind a queued deletion revision", () => {
    expect(nextGuardedFolderDeleteRevision(1794, 1795)).toBe(1795);
  });
});
