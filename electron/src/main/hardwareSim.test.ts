import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { HardwareSimManager, hardwareSimBinaryCandidates } from "./hardwareSim";

describe("hardwareSimBinaryCandidates", () => {
  it("prefers release then debug in development", () => {
    const candidates = hardwareSimBinaryCandidates({
      appPath: "/repo/electron",
      platform: "darwin",
      packaged: false,
    });
    expect(candidates).toEqual([
      path.join(
        "/repo/electron",
        "..",
        "native",
        "hardware-sim-core",
        "target",
        "release",
        "hardware-sim",
      ),
      path.join(
        "/repo/electron",
        "..",
        "native",
        "hardware-sim-core",
        "target",
        "debug",
        "hardware-sim",
      ),
    ]);
  });

  it("uses an exe name for Windows packages", () => {
    const candidates = hardwareSimBinaryCandidates({
      appPath: "C:\\repo\\electron",
      platform: "win32",
      packaged: true,
      resourcesPath: "C:\\app\\resources",
    });
    expect(candidates[0]).toContain(path.join("hardware-sim", "hardware-sim.exe"));
  });
});

describe("HardwareSimManager", () => {
  it("drives the Rust JSON-lines process", async () => {
    const binary = path.resolve(
      __dirname,
      "../../../native/hardware-sim-core/target/debug/hardware-sim",
    );
    const fixture = path.resolve(
      __dirname,
      "../../test-fixtures/hardware-button-led/hardware-sim.json",
    );
    const manager = new HardwareSimManager(() => binary);
    try {
      const started = await manager.start(fixture);
      expect(started.state.components.led1.state.on).toBe(false);

      const pressed = await manager.setButton(started.sessionId, "button1", true);
      expect(pressed.components.led1.state.on).toBe(true);

      const released = await manager.setButton(started.sessionId, "button1", false);
      expect(released.components.led1.state.on).toBe(false);
    } finally {
      manager.dispose();
    }
  });
});
