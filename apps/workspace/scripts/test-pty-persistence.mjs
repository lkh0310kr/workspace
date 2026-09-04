// Verify direct shell spawn (Orca-style, no tmux wrapper).
//
// Run via: ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron --experimental-vm-modules scripts/test-pty-persistence.mjs
// (needs Electron's own Node ABI since node-pty is a native module built
// against it, not the system Node.)

import { Pty } from "../.test-build/pty-test-build.mjs";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let output = Buffer.alloc(0);
  const pty = new Pty({ cols: 80, rows: 24 });
  pty.onData((data) => {
    output = Buffer.concat([output, data]);
  });
  pty.start();
  await sleep(800);
  pty.write(Buffer.from("echo DIRECT_SHELL_OK\n"));
  await sleep(500);
  pty.dispose();

  const text = output.toString("utf8");
  if (text.includes("DIRECT_SHELL_OK")) {
    console.log("PASS: direct shell spawn responded to echo");
    process.exit(0);
  }

  console.error("FAIL: expected DIRECT_SHELL_OK in shell output, got:");
  console.error(JSON.stringify(text));
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
