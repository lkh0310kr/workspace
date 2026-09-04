import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./persistence", () => ({
  appSupportDir: () => join(process.env.WORKSPACE_TEST_LOG_DIR ?? "/tmp/workspace-test-logs"),
}));

describe("debugLogSink", () => {
  let logDir: string;

  beforeEach(() => {
    logDir = mkdtempSync(join(tmpdir(), "workspace-logs-"));
    process.env.WORKSPACE_TEST_LOG_DIR = logDir;
    delete process.env.WORKSPACE_DISABLE_FILE_LOGS;
  });

  afterEach(() => {
    delete process.env.WORKSPACE_TEST_LOG_DIR;
    rmSync(logDir, { recursive: true, force: true });
  });

  it("writes ndjson entries to the logs directory", async () => {
    const { appendNdjsonLog, getLogFilePath } = await import("./debugLogSink");
    appendNdjsonLog("test.ndjson", { event: "hello", n: 1 });
    const line = readFileSync(getLogFilePath("test.ndjson"), "utf8").trim();
    expect(JSON.parse(line)).toMatchObject({ event: "hello", n: 1 });
  });

  it("respects WORKSPACE_DISABLE_FILE_LOGS", async () => {
    process.env.WORKSPACE_DISABLE_FILE_LOGS = "1";
    const { appendNdjsonLog, getLogFilePath } = await import("./debugLogSink");
    appendNdjsonLog("disabled.ndjson", { event: "skip" });
    const { existsSync } = await import("node:fs");
    expect(existsSync(getLogFilePath("disabled.ndjson"))).toBe(false);
  });
});
