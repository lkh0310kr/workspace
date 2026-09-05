import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("startupLog", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "workspace-startup-"));
    process.env.WORKSPACE_TEST_LOG_DIR = logDir;
    delete process.env.WORKSPACE_DISABLE_FILE_LOGS;
  });

  afterEach(() => {
    delete process.env.WORKSPACE_TEST_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it("writes startup.ndjson before Electron app is ready", async () => {
    const { appendStartupLog, getBootstrapLogsDir } = await import("./startupLog");
    appendStartupLog("test_event", { ok: true });
    const line = readFileSync(join(getBootstrapLogsDir(), "startup.ndjson"), "utf8").trim();
    expect(JSON.parse(line)).toMatchObject({ event: "test_event", ok: true, pid: process.pid });
  });
});
