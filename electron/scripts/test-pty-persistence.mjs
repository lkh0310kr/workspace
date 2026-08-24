// Empirical port of pty.rs's `pty_tmux_session_persists_across_reconnect`
// test: verify that disposing a Pty tied to a tmux session key, then
// creating a *new* Pty with the same key, reattaches to the same session
// (proving state set by the first survives) rather than the EOF-on-close
// issue that Rust's portable_pty had (see pty.ts's dispose() comment).
//
// Run via: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --experimental-vm-modules scripts/test-pty-persistence.mjs
// (needs Electron's own Node ABI since node-pty is a native module built
// against it, not the system Node.)

import { Pty } from "../.test-build/pty-test-build.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const key = `workspace-electron-test-${process.pid}`;
  let output1 = Buffer.alloc(0);

  const pty1 = new Pty({ cols: 80, rows: 24, sessionKey: key });
  pty1.onData((data) => {
    output1 = Buffer.concat([output1, data]);
  });
  pty1.start();
  // The tmux client needs time to actually attach before it forwards
  // keystrokes to the pane's shell.
  await sleep(1000);
  pty1.write(Buffer.from("export PERSIST_MARKER=survived\n"));
  await sleep(500);
  pty1.dispose();
  await sleep(300);

  let output2 = Buffer.alloc(0);
  const pty2 = new Pty({ cols: 80, rows: 24, sessionKey: key });
  pty2.onData((data) => {
    output2 = Buffer.concat([output2, data]);
  });
  pty2.start();
  await sleep(1000);
  pty2.write(Buffer.from("echo MARKER_IS=$PERSIST_MARKER\n"));
  await sleep(500);
  pty2.dispose();

  const text = output2.toString("utf8");

  // Clean up the tmux session regardless of outcome.
  try {
    const { execFileSync } = await import("node:child_process");
    execFileSync("tmux", ["kill-session", "-t", key], { stdio: "ignore" });
  } catch {
    // already gone
  }

  if (text.includes("MARKER_IS=survived")) {
    console.log("PASS: second connection saw state set by the first (reattachment confirmed)");
    process.exit(0);
  } else {
    console.error("FAIL: expected 'MARKER_IS=survived' in second connection's output, got:");
    console.error(JSON.stringify(text));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
