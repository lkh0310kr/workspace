import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environmentMatchGlobs: [["src/renderer/**/*.test.ts", "jsdom"]],
  },
});
