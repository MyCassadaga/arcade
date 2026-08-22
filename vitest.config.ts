import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./apps/web/src/test/setup.ts"],
    include: ["packages/**/*.test.ts", "apps/web/**/*.test.{ts,tsx}", "apps/worker/test/**/*.test.ts"],
    exclude: ["apps/worker/test/**/*.integration.test.ts"],
    coverage: { reporter: ["text", "html"] }
  }
});
