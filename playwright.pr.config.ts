import { defineConfig } from "@playwright/test";
import config from "./playwright.config.ts";

export default defineConfig({
  ...config,
  use: {
    ...config.use,
    trace: "on",
    screenshot: "on",
  },
});
