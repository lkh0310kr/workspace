import { describe, expect, it } from "vitest";
import { worldEngineEmbedModuleCandidates } from "./worldEngineEmbed";

describe("worldEngineEmbedModuleCandidates", () => {
  it("includes packaged resources path first when packaged", () => {
    const candidates = worldEngineEmbedModuleCandidates({
      appPath: "/app/electron",
      platform: "win32",
      packaged: true,
      resourcesPath: "/app/resources",
    });
    expect(candidates[0]).toBe(
      "/app/resources/world-engine-embed/world_engine_electron_embed.node",
    );
  });

  it("includes dev release and debug paths on macOS", () => {
    const candidates = worldEngineEmbedModuleCandidates({
      appPath: "/app/electron",
      platform: "darwin",
      packaged: false,
      resourcesPath: "",
    });
    expect(candidates).toContain(
      "/app/world-engine/embed/target/release/world_engine_electron_embed.node",
    );
    expect(candidates).toContain(
      "/app/world-engine/embed/target/debug/libworld_engine_electron_embed.dylib",
    );
  });
});
