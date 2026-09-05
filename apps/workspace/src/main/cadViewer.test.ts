import { describe, expect, it } from "vitest";
import * as path from "node:path";
import {
  buildCadViewerFileUrl,
  isCadViewerExtension,
  parseCadViewerLaunchJson,
} from "../shared/cadViewer";
import { findAgentsPython } from "./cadViewer";

describe("cadViewer shared", () => {
  it("detects CAD viewer extensions", () => {
    expect(isCadViewerExtension("robot.urdf")).toBe(true);
    expect(isCadViewerExtension("layout.dxf")).toBe(true);
    expect(isCadViewerExtension("models/part.step")).toBe(false);
    expect(isCadViewerExtension("mesh.stl")).toBe(false);
    expect(isCadViewerExtension("scene.glb")).toBe(false);
  });

  it("builds file deep links", () => {
    expect(buildCadViewerFileUrl(3245, "models/m3-bracket/bracket.step")).toBe(
      "http://127.0.0.1:3245/?file=models%2Fm3-bracket%2Fbracket.step",
    );
  });

  it("parses cadgen viewer --json stdout", () => {
    const stdout = `Starting CAD Viewer at http://127.0.0.1:3245/
{"url":"http://127.0.0.1:3245/","port":3245,"action":"started"}`;
    expect(parseCadViewerLaunchJson(stdout)).toEqual({
      url: "http://127.0.0.1:3245/",
      port: 3245,
      action: "started",
    });
  });
});

describe("findAgentsPython", () => {
  it("walks up to find .agents/.venv", () => {
    const root = path.resolve("/repo");
    const start = path.join(root, "apps", "workspace");
    const venvPython = path.join(root, ".agents", ".venv", "bin", "python");
    const exists = (p: string) => path.resolve(p) === venvPython;
    expect(findAgentsPython(start, exists)).toBe(venvPython);
  });
});
