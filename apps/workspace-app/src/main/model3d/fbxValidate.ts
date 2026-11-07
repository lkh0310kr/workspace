import * as fs from "node:fs";

/** Reject sniffer header-only stubs that Three.js FBXLoader cannot parse. */
export const MIN_LOADABLE_FBX_BYTES = 500;

export function isLoadableFbxFile(absolutePath: string): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return false;
  }
  if (!stat.isFile() || stat.size < MIN_LOADABLE_FBX_BYTES) {
    return false;
  }

  const header = Buffer.alloc(64);
  const fd = fs.openSync(absolutePath, "r");
  try {
    const read = fs.readSync(fd, header, 0, header.length, 0);
    const text = header.subarray(0, read).toString("ascii");
    return text.startsWith("Kaydara FBX Binary") || text.startsWith("; FBX");
  } finally {
    fs.closeSync(fd);
  }
}
