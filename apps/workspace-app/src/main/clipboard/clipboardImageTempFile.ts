import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { app } from "electron";
import { assertClipboardImageByteLengthWithinLimit } from "../../shared/clipboard-image";

export async function saveClipboardImageBufferAsTempFile(buffer: Buffer): Promise<string> {
  assertClipboardImageByteLengthWithinLimit(buffer.byteLength);

  const fileName = `workspace-paste-${Date.now()}-${randomUUID()}.png`;
  const tempPath = path.join(app.getPath("temp"), fileName);
  await fs.writeFile(tempPath, buffer);
  return tempPath;
}
