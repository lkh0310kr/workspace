import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const adb = process.env.ADB ?? resolve(process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`, "platform-tools/adb");
const apk = resolve(appDir, "app/build/outputs/apk/debug/app-debug.apk");
const packageName = "dev.pkms.datanode";
const providerUri = "content://dev.pkms.datanode.provider/node";
const runId = `local-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${process.pid}`;
const outputDir = resolve(appDir, ".artifacts", runId);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed (${result.status ?? result.signal})${detail ? `\n${detail}` : ""}`);
  }
  return result.stdout ?? "";
}

function adbRun(serial, ...args) {
  return run(adb, ["-s", serial, ...args]);
}

function callNode(serial, method, payload = {}) {
  const arg = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  const output = adbRun(serial, "shell", "content", "call", "--uri", providerUri, "--method", method, "--arg", arg);
  const encoded = output.match(/result=([A-Za-z0-9+/=]+)/)?.[1];
  if (!encoded) throw new Error(`ADB provider returned an unreadable response for ${method}: ${output.trim()}`);
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

function assertHostCheck(checks, name, action) {
  const started = Date.now();
  try {
    const detail = action();
    checks.push({ name, status: "passed", durationMs: Date.now() - started, ...(detail ?? {}) });
  } catch (error) {
    checks.push({ name, status: "failed", durationMs: Date.now() - started, message: error.message });
    throw error;
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readDeviceReport(serial, expectedRunId, mode) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const raw = adbRun(serial, "exec-out", "run-as", packageName, "cat", "files/data-node/latest-diagnostics.json");
      const report = JSON.parse(raw);
      if (report.runId === expectedRunId && report.mode === mode) return report;
    } catch {
      // Activity may still be running or the report may belong to the previous phase.
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
  throw new Error(`Timed out waiting for ${mode} diagnostics report from the device`);
}

function assertPassed(report, phase) {
  const failures = report.checks.filter((check) => check.status !== "passed");
  if (report.status !== "passed" || failures.length) {
    throw new Error(`${phase} failed:\n${JSON.stringify(failures.length ? failures : report, null, 2)}`);
  }
}

try {
  console.log("[data-node] Building Android debug APK...");
  run(resolve(appDir, "gradlew"), ["--no-daemon", "assembleDebug"], { cwd: appDir, stdio: "inherit" });

  const deviceList = run(adb, ["devices", "-l"]);
  const devices = deviceList.split(/\r?\n/).slice(1).filter((line) => line.trim()).map((line) => ({
    serial: line.trim().split(/\s+/)[0],
    state: line.trim().split(/\s+/)[1],
    details: line.trim(),
  }));
  const requestedSerial = process.argv.find((arg) => arg.startsWith("--serial="))?.slice("--serial=".length);
  const usable = devices.filter((device) => device.state === "device");
  const unauthorized = devices.filter((device) => device.state === "unauthorized");
  if (!requestedSerial && usable.length > 1) throw new Error(`More than one ADB device is connected. Rerun with --serial=<serial>.\n${devices.map((d) => d.details).join("\n")}`);
  const selected = requestedSerial ? devices.find((device) => device.serial === requestedSerial) : usable[0];
  if (!selected || selected.state !== "device") {
    const hint = unauthorized.length ? "Approve the USB debugging prompt on the phone, then rerun." : "Connect an Android device and enable USB debugging, then rerun.";
    throw new Error(`${hint}\n${devices.map((d) => d.details).join("\n") || "No devices found"}`);
  }
  const serial = selected.serial;
  console.log(`[data-node] Target: ${selected.details}`);
  adbRun(serial, "install", "-r", apk);
  adbRun(serial, "shell", "am", "force-stop", packageName);
  adbRun(serial, "shell", "am", "start", "-W", "-n", `${packageName}/.DataNodeActivity`, "--es", "mode", "initial", "--es", "run_id", runId);
  const initial = readDeviceReport(serial, runId, "initial");
  assertPassed(initial, "Initial storage checks");

  const hostChecks = [];
  const namespace = `adb-e2e-${runId}`;
  const recordValue = JSON.stringify({ source: "adb", runId });
  const operationId = `${runId}-host-write`;
  const batch = {
    operationId,
    mutations: [
      { namespace, key: "record", value: recordValue },
      { namespace, key: "record-b", value: "{\"index\":2}" },
    ],
  };
  let objectId;
  const objectBytes = Buffer.from(`adb-object:${runId}`, "utf8");
  assertHostCheck(hostChecks, "adb_provider_health", () => {
    const result = callNode(serial, "health");
    if (!result.ok || result.integrity !== "ok") throw new Error(JSON.stringify(result));
    return { device: result.device, sdk: result.sdk };
  });
  assertHostCheck(hostChecks, "adb_transactional_batch_and_idempotent_retry", () => {
    const first = callNode(serial, "record.batch", batch);
    const retry = callNode(serial, "record.batch", batch);
    if (!first.ok || !retry.ok || first.revision !== retry.revision || first.replayed || !retry.replayed || first.changedRecords !== 2) {
      throw new Error(JSON.stringify({ first, retry }));
    }
    return { revision: first.revision, version: retry.version };
  });
  assertHostCheck(hostChecks, "adb_idempotency_conflict_rejected", () => {
    const result = callNode(serial, "record.batch", {
      operationId,
      mutations: [{ namespace, key: "record", value: JSON.stringify({ source: "wrong-payload" }) }],
    });
    if (result.ok || result.errorCode !== "IdempotencyConflict") throw new Error(JSON.stringify(result));
    return { errorCode: result.errorCode };
  });
  assertHostCheck(hostChecks, "adb_transaction_rollback_on_version_conflict", () => {
    const conflict = callNode(serial, "record.batch", {
      operationId: `${runId}-host-rollback`,
      mutations: [
        { namespace, key: "must-rollback", value: "{\"partial\":true}" },
        { namespace, key: "record", value: recordValue, expectedVersion: 99 },
      ],
    });
    const partial = callNode(serial, "record.get", { namespace, key: "must-rollback" });
    if (conflict.ok || conflict.errorCode !== "VersionConflict" || !partial.ok || partial.found) throw new Error(JSON.stringify({ conflict, partial }));
    return { errorCode: conflict.errorCode, partialWriteAbsent: true };
  });
  assertHostCheck(hostChecks, "adb_record_read", () => {
    const first = callNode(serial, "record.get", { namespace, key: "record" });
    const second = callNode(serial, "record.get", { namespace, key: "record-b" });
    if (!first.ok || !first.found || first.value !== recordValue || first.version !== 1 || !second.ok || !second.found || second.value !== "{\"index\":2}") {
      throw new Error(JSON.stringify({ first, second }));
    }
    return { recordsRead: 2, version: first.version };
  });
  assertHostCheck(hostChecks, "adb_object_write_and_dedup", () => {
    const payload = { bytesBase64: objectBytes.toString("base64"), contentType: "application/octet-stream" };
    const first = callNode(serial, "object.put", payload);
    const second = callNode(serial, "object.put", payload);
    objectId = first.objectId;
    const expectedHash = sha256(objectBytes);
    if (!first.ok || !second.ok || first.objectId !== second.objectId || first.sha256 !== expectedHash || first.byteSize !== objectBytes.length) {
      throw new Error(JSON.stringify({ first, second }));
    }
    return { objectId, byteSize: objectBytes.length };
  });
  assertHostCheck(hostChecks, "adb_object_read_and_checksum", () => {
    const result = callNode(serial, "object.get", { objectId });
    const bytes = Buffer.from(result.bytesBase64 ?? "", "base64");
    if (!result.ok || !result.found || !bytes.equals(objectBytes) || result.sha256 !== sha256(objectBytes)) throw new Error(JSON.stringify(result));
    return { objectId, byteSize: bytes.length };
  });

  adbRun(serial, "shell", "am", "force-stop", packageName);
  adbRun(serial, "shell", "am", "start", "-W", "-n", `${packageName}/.DataNodeActivity`, "--es", "mode", "restart", "--es", "run_id", runId);
  const restarted = readDeviceReport(serial, runId, "restart");
  assertPassed(restarted, "Process restart checks");
  assertHostCheck(hostChecks, "adb_record_read_after_process_restart", () => {
    const result = callNode(serial, "record.get", { namespace, key: "record" });
    const second = callNode(serial, "record.get", { namespace, key: "record-b" });
    if (!result.ok || !result.found || result.value !== recordValue || !second.ok || !second.found || second.value !== "{\"index\":2}") {
      throw new Error(JSON.stringify({ result, second }));
    }
  });
  assertHostCheck(hostChecks, "adb_object_read_after_process_restart", () => {
    const result = callNode(serial, "object.get", { objectId });
    const bytes = Buffer.from(result.bytesBase64 ?? "", "base64");
    if (!result.ok || !result.found || !bytes.equals(objectBytes) || result.sha256 !== sha256(objectBytes)) throw new Error(JSON.stringify(result));
  });

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, "initial.json"), `${JSON.stringify(initial, null, 2)}\n`);
  writeFileSync(resolve(outputDir, "restart.json"), `${JSON.stringify(restarted, null, 2)}\n`);
  writeFileSync(resolve(outputDir, "adb-host-checks.json"), `${JSON.stringify(hostChecks, null, 2)}\n`);
  const logs = adbRun(serial, "logcat", "-d", "-s", "DataNode:I", "AndroidRuntime:E", "*:S");
  writeFileSync(resolve(outputDir, "logcat.txt"), logs);
  const summary = {
    status: "passed",
    serial,
    model: initial.device,
    sdk: initial.sdk,
    initialChecks: initial.checkCount,
    restartChecks: restarted.checkCount,
    adbHostChecks: hostChecks.length,
    runId,
    artifacts: outputDir,
  };
  writeFileSync(resolve(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(`[data-node] ${error.stack ?? error.message}`);
  process.exitCode = 1;
}

