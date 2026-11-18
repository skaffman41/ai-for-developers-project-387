import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { test } from "vitest";

test("PR browser checks the exact head on an isolated runner without model credentials", async () => {
  const workflow = parse(
    await readFile(".github/workflows/opencode-pr-review.yml", "utf8"),
  );
  assert.deepEqual(workflow.on, {
    pull_request: { types: ["opened", "synchronize", "reopened"] },
  });
  assert.equal(workflow.concurrency, undefined);
  const browser = workflow.jobs.browser;
  assert.equal(browser.needs, "authorize");
  assert.equal(browser.if, "needs.authorize.outputs.allowed == 'true'");
  assert.equal(browser["runs-on"], "ubuntu-24.04");
  assert.deepEqual(browser.permissions, { contents: "read" });
  assert.doesNotMatch(
    JSON.stringify(browser),
    /secrets\.|OPENCODE|opencode|id-token/,
  );
  const checkout = browser.steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(
    checkout.uses,
    "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  );
  assert.deepEqual(checkout.with, {
    ref: "${{ github.event.pull_request.head.sha }}",
    "persist-credentials": false,
  });
  const install = browser.steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("jdx/mise-action@"),
  );
  assert.equal(
    install.uses,
    "jdx/mise-action@b44d12e7d0d8ee7461bb893e1b1993500433185b",
  );
  assert.deepEqual(install.with, {
    version: "2026.11.3",
    install_args: "--locked",
  });
  assert.ok(
    browser.steps.some(
      (step: { run?: string }) =>
        step.run ===
        "mise run test:browser -- --config playwright.pr.config.ts",
    ),
  );
  const appCheck = parse(
    await readFile(".github/workflows/app-check.yml", "utf8"),
  );
  assert.ok(
    appCheck.jobs.check.steps.some(
      (step: { run?: string }) => step.run === "mise run check",
    ),
  );
});

test.each(["success", "failure"])(
  "%s PR browser runs retain a real Playwright trace, screenshot and HTML report",
  async (outcome) => {
    const fixture = await mkdtemp(join(tmpdir(), "pr-browser-artifacts-"));
    try {
      await writeFile(
        join(fixture, "playwright.config.ts"),
        `import config from ${JSON.stringify(resolve("playwright.pr.config.ts"))};
export default {
  ...config,
  testDir: ${JSON.stringify(fixture)},
  testMatch: "artifact.spec.ts",
  outputDir: ${JSON.stringify(join(fixture, "results"))},
  reporter: [["list"], ["html", { open: "never", outputFolder: ${JSON.stringify(join(fixture, "report"))} }]],
  webServer: undefined,
};`,
      );
      await writeFile(
        join(fixture, "artifact.spec.ts"),
        `import { test, expect } from ${JSON.stringify(resolve("node_modules/@playwright/test/index.mjs"))};
test("browser artifact fixture", async ({ page }) => {
  await page.setContent("<main>PR browser evidence</main>");
  await expect(page.locator("main")).toHaveText(${JSON.stringify(outcome === "success" ? "PR browser evidence" : "deliberate artifact failure")}, { timeout: 1 });
});`,
      );
      const run = spawnSync(
        process.execPath,
        [
          resolve("node_modules/@playwright/test/cli.js"),
          "test",
          "--config",
          join(fixture, "playwright.config.ts"),
        ],
        { encoding: "utf8", timeout: 60_000 },
      );
      assert.equal(
        run.status,
        outcome === "success" ? 0 : 1,
        run.stdout + run.stderr,
      );
      assert.match(run.stdout, outcome === "success" ? /1 passed/ : /1 failed/);
      assert.match(
        await readFile(join(fixture, "report", "index.html"), "utf8"),
        /Playwright Test Report/,
      );
      const files = await readdir(join(fixture, "results"), {
        recursive: true,
      });
      const trace = files.find((path) => path.endsWith("trace.zip"));
      const screenshot = files.find((path) => path.endsWith(".png"));
      assert.ok(trace, `${outcome} runs need a trace`);
      assert.ok(screenshot, `${outcome} runs need a screenshot`);
      assert.equal(
        (await readFile(join(fixture, "results", trace)))
          .subarray(0, 2)
          .toString(),
        "PK",
      );
      assert.deepEqual(
        (await readFile(join(fixture, "results", screenshot))).subarray(0, 8),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);

test("PR browser artifacts record the actual checkout SHA and reject a different version", async () => {
  const workflow = parse(
    await readFile(".github/workflows/opencode-pr-review.yml", "utf8"),
  );
  const steps = workflow.jobs.browser.steps;
  const initialize = steps.find(
    (step: { id?: string }) => step.id === "evidence",
  );
  const verify = steps.find((step: { id?: string }) => step.id === "verify");
  assert.ok(initialize, "evidence must be initialized before checkout");
  assert.equal(steps[0], initialize);
  assert.ok(verify, "the actual checked-out SHA must be verified");
  assert.match(verify.run, /git rev-parse HEAD/);
  const fixture = await mkdtemp(join(tmpdir(), "pr-browser-sha-"));
  const expectedSha = "4444444444444444444444444444444444444444";
  const actualSha = spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim();
  const env = {
    ...process.env,
    RUNNER_TEMP: fixture,
    EXPECTED_SHA: expectedSha,
    GITHUB_STEP_SUMMARY: join(fixture, "summary.md"),
  };
  try {
    assert.equal(
      spawnSync("bash", ["-e", "-c", initialize.run], { env }).status,
      0,
    );
    assert.equal(
      spawnSync("bash", ["-e", "-c", verify.run], { env }).status,
      1,
    );
    const evidence = join(fixture, "pr-browser-evidence");
    assert.equal(
      (await readFile(join(evidence, "actual-sha.txt"), "utf8")).trim(),
      actualSha,
    );
    assert.equal(
      (
        await readFile(join(evidence, "verification-status.txt"), "utf8")
      ).trim(),
      "mismatch",
    );
    assert.equal(
      spawnSync("bash", ["-e", "-c", verify.run], {
        env: { ...env, EXPECTED_SHA: actualSha },
      }).status,
      0,
    );
    assert.equal(
      (
        await readFile(join(evidence, "verification-status.txt"), "utf8")
      ).trim(),
      "verified",
    );
    assert.match(
      await readFile(env.GITHUB_STEP_SUMMARY, "utf8"),
      new RegExp(actualSha),
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("PR browser always uploads a run report, including setup failure before Playwright", async () => {
  const workflow = parse(
    await readFile(".github/workflows/opencode-pr-review.yml", "utf8"),
  );
  const steps = workflow.jobs.browser.steps;
  const report = steps.find((step: { id?: string }) => step.id === "report");
  const upload = steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  );
  assert.ok(report, "setup failures must still produce a run report");
  assert.equal(report.if, "${{ !cancelled() }}");
  assert.ok(upload, "browser evidence must be uploaded");
  assert.equal(upload.if, "${{ !cancelled() }}");
  assert.equal(
    upload.uses,
    "actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9",
  );
  assert.equal(
    upload.with.name,
    "pr-browser-${{ github.run_id }}-${{ github.run_attempt }}",
  );
  assert.equal(upload.with["if-no-files-found"], "error");
  assert.match(upload.with.path, /runner.temp.*pr-browser-evidence/);
  assert.match(upload.with.path, /playwright-report\//);
  assert.match(upload.with.path, /test-results\//);
  const fixture = await mkdtemp(join(tmpdir(), "pr-browser-report-"));
  try {
    for (const outcome of ["success", "failure", "skipped"]) {
      const env = {
        ...process.env,
        RUNNER_TEMP: fixture,
        GITHUB_STEP_SUMMARY: join(fixture, "summary.md"),
        EXPECTED_SHA: "4444444444444444444444444444444444444444",
        CHECKOUT_OUTCOME: outcome === "skipped" ? "failure" : "success",
        TOOLS_OUTCOME: outcome === "skipped" ? "skipped" : "success",
        DEPENDENCIES_OUTCOME: outcome === "skipped" ? "skipped" : "success",
        CHROMIUM_OUTCOME: outcome === "skipped" ? "skipped" : "success",
        BROWSER_OUTCOME: outcome,
      };
      assert.equal(
        spawnSync("bash", ["-e", "-c", report.run], { env }).status,
        0,
      );
      const reportText = await readFile(
        join(fixture, "pr-browser-evidence", "run-report.md"),
        "utf8",
      );
      assert.match(reportText, new RegExp(`Browser: ${outcome}`));
      assert.match(reportText, /4444444444444444444444444444444444444444/);
      assert.match(reportText, /Actual checkout: unavailable/);
      assert.match(reportText, /Verification: not_verified/);
      assert.match(
        await readFile(
          join(fixture, "pr-browser-evidence", "run-report.html"),
          "utf8",
        ),
        new RegExp(`Browser: ${outcome}`),
      );
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
