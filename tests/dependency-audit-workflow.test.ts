import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { test } from "vitest";

test("Audit report consumers use runner context only where GitHub makes it available", async () => {
  const workflow = parse(
    await readFile(".github/workflows/dependency-audit.yml", "utf8"),
  );
  const job = workflow.jobs.audit;
  // GitHub excludes runner from jobs.<job_id>.env, but allows it in steps.env:
  // https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#context-availability
  assert.doesNotMatch(
    JSON.stringify(job.env),
    /\$\{\{[^}]*\brunner(?:\.|\s*\[)/,
    "Job env is evaluated before runner context is available",
  );
  for (const command of [
    "scripts/prepare-github-agent.mjs",
    "scripts/run-dependency-audit.mjs analyze",
    "scripts/run-dependency-audit.mjs publish",
    "GITHUB_STEP_SUMMARY",
  ]) {
    const step = job.steps.find((candidate: { run?: string }) =>
      candidate.run?.includes(command),
    );
    assert.ok(step, `Missing report consumer: ${command}`);
    assert.equal(
      step.env?.DEPENDENCY_AUDIT_DIRECTORY,
      "${{ runner.temp }}/dependency-audit",
      `${command} must receive the report directory outside checkout`,
    );
  }
});

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
