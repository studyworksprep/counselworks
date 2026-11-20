import { defineConfig, mergeConfig } from "vitest/config";
import base from "../../vitest.config";

export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/ai-quality/live.test.ts"],
      fileParallelism: false,
      maxWorkers: 1,
      testTimeout: 60000,
    },
  }),
);
