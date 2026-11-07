import { spawnSync } from "node:child_process";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

type GpioEvent = {
  t_ns: number;
  pin: string;
  level: "high" | "low" | "high_impedance";
};

describe("avr8js sidecar", () => {
  it("emits real D13 transitions from compiled Arduino Blink firmware", () => {
    const electronRoot = path.resolve(__dirname, "../../../");
    const result = spawnSync(
      process.execPath,
      [
        path.join(electronRoot, "scripts/hardware/avr8js-sidecar.mjs"),
        "--hex",
        path.join(
          electronRoot,
          "test-fixtures/hardware-blink/firmware/blink/blink.ino.hex",
        ),
        "--duration-ms",
        "1050",
      ],
      { encoding: "utf8", timeout: 10_000 },
    );

    expect(result.status, result.stderr).toBe(0);
    const events = result.stdout
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as GpioEvent);
    expect(events.map(({ pin, level }) => ({ pin, level }))).toEqual([
      { pin: "D13", level: "low" },
      { pin: "D13", level: "high" },
      { pin: "D13", level: "low" },
      { pin: "D13", level: "high" },
    ]);

    const firstPeriodNs = events[2].t_ns - events[1].t_ns;
    expect(firstPeriodNs).toBeGreaterThan(490_000_000);
    expect(firstPeriodNs).toBeLessThan(510_000_000);
  });
});
