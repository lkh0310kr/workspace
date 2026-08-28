import { describe, expect, it } from "vitest";
import { worldEngineBinaryCandidates } from "./worldEngine";

describe("worldEngineBinaryCandidates", () => {
  it("includes .exe names before the extensionless binary on Windows-like hosts", () => {
    const candidates = worldEngineBinaryCandidates("/app/electron", "win32", false);
    expect(candidates[0]).toMatch(/world-engine-qt-shell\.exe$/);
    expect(candidates).toContain(
      "/app/native/world-engine-qt-shell/target/debug/world-engine-qt-shell.exe",
    );
    expect(candidates).toContain(
      "/app/native/world-engine-qt-shell/target/release/world-engine-qt-shell.exe",
    );
  });
});
