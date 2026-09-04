import { describe, expect, it } from "vitest";
import { worldEngineBinaryCandidates } from "./worldEngine";

describe("worldEngineBinaryCandidates", () => {
  it("includes .exe names and prefers release before debug on Windows-like hosts", () => {
    const candidates = worldEngineBinaryCandidates({
      appPath: "/app/apps/workspace",
      platform: "win32",
      wsl: false,
      packaged: false,
      resourcesPath: "/app/resources",
    });
    expect(candidates[0]).toMatch(/release\/world-engine-qt-shell\.exe$/);
    expect(candidates).toContain(
      "/app/world-engine/qt-shell/target/release/world-engine-qt-shell.exe",
    );
    expect(candidates).toContain(
      "/app/world-engine/qt-shell/target/debug/world-engine-qt-shell.exe",
    );
  });

  it("prefers packaged resources path when app is packaged", () => {
    const candidates = worldEngineBinaryCandidates({
      appPath: "/app/apps/workspace",
      platform: "win32",
      wsl: false,
      packaged: true,
      resourcesPath: "/app/resources",
    });
    expect(candidates[0]).toBe("/app/resources/world-engine/world-engine-qt-shell.exe");
  });
});
