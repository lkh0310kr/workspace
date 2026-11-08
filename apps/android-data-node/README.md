# Android Data Node prototype

> **Status: Cancelled** — implementation work stopped at the user's request on 2026-11-08. See the [cancellation record](../../docs/research/data-node/CANCELLATION.md) for verified scope and unfinished work.

This is a local storage-engine prototype. It does not use the network, Supabase, Cloudflare, GitHub, or USB port forwarding. The app stores records in SQLite and immutable objects in its private app files directory. During local development, a protected Android ContentProvider lets the ADB shell send storage commands directly to the app; ordinary apps do not receive its `android.permission.DUMP` permission.

## One-click device verification

Requirements: JDK 17, Android SDK Platform 35, platform tools, and one Android device with USB debugging enabled and this computer authorized.

From the workspace root:

```bash
npm run data-node:one-click
```

The command builds and installs the debug APK, runs local storage checks, sends record and object operations from the laptop through `adb shell content call`, creates synthetic crash fixtures for pending uploads, missing/corrupt metadata-backed objects, and orphan files, force-stops and relaunches the app, then verifies reconciliation and persisted error codes. It keeps the app's private data so repeated runs also exercise an existing database. If multiple Android devices are connected, select one explicitly:

```bash
npm run data-node:one-click -- --serial=DEVICE_SERIAL
```

Reports and filtered Android logs are written under `apps/android-data-node/.artifacts/`. The app also has a **Run local verification** button. To inspect its latest report directly, use:

```bash
adb shell run-as dev.pkms.datanode cat files/data-node/latest-diagnostics.json
```

## What this prototype verifies

- SQLite integrity before and after writes
- A multi-record transaction and monotonically increasing revision
- Idempotent retries and rejection of a reused operation ID with a different payload
- Transaction rollback on a version conflict
- SHA-256 content-addressed object write, read-back, and deduplication
- Record and object persistence after the Android app process is stopped and restarted
- Structured per-check result reports and Android log entries
- Direct host-to-Android commands over ADB without an IP network
- ADB shell batch transaction, retry/conflict behavior, rollback, and object round-trip
- ADB-written records and objects after the app process is stopped and restarted
- v1→v3 SQLite migration preserving existing records and objects
- Startup recovery of pending uploads, missing objects, checksum-corrupt objects, and orphan files; orphan data is retained as a candidate, not deleted

## ADB local command bridge

The debug app exposes `content://dev.pkms.datanode.provider/node` through these methods: `health`, `record.put`, `record.batch`, `record.get`, `object.put`, `object.get`, and `diagnostics.errors`. The `--arg` is a base64-encoded UTF-8 JSON object. For example, the empty JSON object is `e30=`:

```bash
adb shell content call \
  --uri content://dev.pkms.datanode.provider/node \
  --method health \
  --arg e30=
```

The response is returned as base64 JSON in the `result` Bundle field. The one-click runner performs encoding, decoding, and response checks automatically. The current shell bridge transports bytes inline in a Binder call and is only for small local validation payloads; it is not the streaming object API needed for larger files.

This prototype is not yet a production database service: it has no remote API, streaming object uploads/downloads, encryption/key management, deletion/reference/GC semantics, replication, backup export, foreground service, or long-running background operation. The next gates are the streamed object API, power-loss and storage-full testing, backup/restore, and repeating the same one-click run on the A Quantum.
