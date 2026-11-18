import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { test } from "vitest";

test("Both main-only audit entries share one daily Moscow schedule, 20-minute budget and non-cancelling concurrency with issue-only publication", async () => {
  const text = await readFile(".github/workflows/dependency-audit.yml", "utf8");
  const workflow = parse(text);
  assert.deepEqual(Object.keys(workflow.on).sort(), [
    "schedule",
    "workflow_dispatch",
  ]);
  assert.deepEqual(workflow.on.schedule, [
    { cron: "17 6 * * *", timezone: "Europe/Moscow" },
  ]);
  assert.equal(
    workflow.concurrency.group,
    "dependency-audit-${{ github.repository }}",
  );
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.input.options, [
    "real",
    "educational",
    "replay",
  ]);
  assert.equal(workflow.on.workflow_dispatch.inputs.input.default, "real");
  assert.equal(workflow.on.workflow_dispatch.inputs.source_run.type, "string");
  assert.equal(
    workflow.on.workflow_dispatch.inputs.source_attempt.type,
    "string",
  );
  const job = workflow.jobs.audit;
  assert.equal(job["timeout-minutes"], 20);
  assert.match(job.if, /github.ref == 'refs\/heads\/main'/);
  assert.match(job.if, /skaffman41\/ai-for-developers-project-387/);
  assert.deepEqual(job.permissions, {
    contents: "read",
    issues: "write",
    actions: "read",
  });
  const steps = job.steps;
  assert.ok(
    steps.some(
      (step: { with?: { ref?: string; "persist-credentials"?: boolean } }) =>
        step.with?.ref === "${{ github.sha }}" &&
        step.with["persist-credentials"] === false,
    ),
  );
  assert.match(text, /VERSION: "1.19.6"/);
  assert.match(text, /GITHUB_AGENT_MODE: audit/);
  assert.match(text, /scripts\/prepare-github-agent.mjs/);
  assert.match(text, /scripts\/run-dependency-audit.mjs/);
  const publisher = steps.find((step: { run?: string }) =>
    step.run?.includes("run-dependency-audit.mjs publish"),
  );
  assert.ok(publisher, "Publication must have a separate workflow step");
  assert.equal(publisher.env.OPENCODE_API_KEY, undefined);
  const upload = steps.find((step: { uses?: string }) =>
    step.uses?.startsWith("actions/upload-artifact@"),
  );
  assert.equal(upload.if, "always()");
  assert.equal(upload.with["retention-days"], 30);
  assert.match(upload.with.path, /runner.temp/);
  assert.ok(
    steps.some(
      (step: { if?: string; run?: string }) =>
        step.if === "always()" && step.run?.includes("GITHUB_STEP_SUMMARY"),
    ),
  );
});
