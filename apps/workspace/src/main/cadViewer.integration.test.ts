import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { openCadViewerFile, disposeCadViewers, findAgentsPython } from "./cadViewer";

const REPO_ROOT = path.join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..", "..");
const BRACKET = "models/m3-bracket/bracket.step";

describe("cadViewer integration", () => {
  it("opens bracket.step via cadgen viewer when agents venv is installed", async () => {
    const python = findAgentsPython(REPO_ROOT);
    const bracketAbs = path.join(REPO_ROOT, BRACKET);
    if (!python || !existsSync(bracketAbs)) {
      console.warn("Skipping CAD Viewer integration — run agents:python:setup and agents:cad:verify first");
      return;
    }

    const result = await openCadViewerFile(REPO_ROOT, BRACKET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.url).toContain("models%2Fm3-bracket%2Fbracket.step");
    expect(result.port).toBeGreaterThan(0);

    disposeCadViewers();
  }, 90_000);
});
