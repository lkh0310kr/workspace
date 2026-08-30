import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getSchemaSql(): string {
  return readFileSync(join(__dirname, "schema.sql"), "utf8");
}
