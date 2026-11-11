import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs the submission test cases end to end and writes unedited outputs to raw-outputs/.
// Uses the real Supabase project and free AI providers from .env.local.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/integration/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/raw/**/*.test.ts"],
    environment: "node",
    testTimeout: 600_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
