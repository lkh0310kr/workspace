import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { toEngineBundleUrl, contentTypeFor, isPathConfined, resolveEngineBundleDir, ENGINE_SCHEME } from "./engineBundlePaths";

describe("toEngineBundleUrl", () => {
  it("builds a URL under the fixed host with the bundle dir as the path", () => {
    expect(toEngineBundleUrl("/Users/kh/proj/export/web")).toBe(
      `${ENGINE_SCHEME}://local/Users/kh/proj/export/web/index.html`,
    );
  });

  it("uses a custom entry file when given one", () => {
    expect(toEngineBundleUrl("/a/b", "game.html")).toBe(`${ENGINE_SCHEME}://local/a/b/game.html`);
  });

  it("percent-encodes path segments with spaces", () => {
    expect(toEngineBundleUrl("/Users/kh/My Project/web")).toBe(
      `${ENGINE_SCHEME}://local/Users/kh/My%20Project/web/index.html`,
    );
  });
});

describe("resolveEngineBundleDir", () => {
  it("returns a URL when the entry file exists", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "engine-bundle-"));
    const index = path.join(dir, "index.html");
    fs.writeFileSync(index, "<html></html>");
    const result = resolveEngineBundleDir(dir);
    expect(result).toEqual({ ok: true, url: toEngineBundleUrl(dir) });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("guides world-engine.json projects away from Open as App", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "world-engine-"));
    fs.writeFileSync(path.join(dir, "world-engine.json"), "{}");
    const result = resolveEngineBundleDir(dir, "index.html", { worldEngineProject: true });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Open in World Engine");
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports a missing Web export entry", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "empty-bundle-"));
    const result = resolveEngineBundleDir(dir);
    expect(result.ok).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("contentTypeFor", () => {
  it("maps .wasm to application/wasm (required for streaming instantiation)", () => {
    expect(contentTypeFor("/a/b/game.wasm")).toBe("application/wasm");
  });

  it("maps known extensions case-insensitively", () => {
    expect(contentTypeFor("/a/INDEX.HTML")).toBe("text/html");
  });

  it("falls back to application/octet-stream for an unknown extension", () => {
    expect(contentTypeFor("/a/b.godotdata")).toBe("application/octet-stream");
  });

  it("serves Godot's .pck data pack as octet-stream (no registered MIME)", () => {
    expect(contentTypeFor("/a/game.pck")).toBe("application/octet-stream");
  });
});

describe("isPathConfined", () => {
  it("allows a path that is exactly a root", () => {
    const root = os.tmpdir();
    expect(isPathConfined(fs.realpathSync(root), [root])).toBe(true);
  });

  it("allows a path nested under a root", () => {
    const root = fs.realpathSync(os.tmpdir());
    const nested = path.join(root, "some", "nested", "file.html");
    expect(isPathConfined(nested, [root])).toBe(true);
  });

  it("rejects a path outside every allowed root", () => {
    const root = fs.realpathSync(os.tmpdir());
    expect(isPathConfined("/etc/passwd", [root])).toBe(false);
  });

  it("rejects a sibling directory that merely shares a prefix (no trailing separator)", () => {
    // e.g. root "/a/b" must not confine "/a/bc/file" just because the
    // string "/a/b" is a prefix of "/a/bc" — the trailing path.sep in the
    // real check is exactly what prevents this.
    const root = fs.realpathSync(os.tmpdir());
    expect(isPathConfined(`${root}-evil-sibling/file.html`, [root])).toBe(false);
  });

  it("rejects when no roots are allowed", () => {
    expect(isPathConfined(fs.realpathSync(os.tmpdir()), [])).toBe(false);
  });
});
