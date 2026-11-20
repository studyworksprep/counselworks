import { defineConfig } from "vitest/config";
import base from "../../vitest.config";

export default defineConfig({
  resolve: base.resolve,
  test: {
    include: ["tests/ai-quality/live.test.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60000,
  },
});
