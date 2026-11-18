import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "vitest";
import { parse } from "yaml";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-helpers-"));
  const trusted = join(directory, "trusted");
  const data = join(directory, "data");
  const runtime = join(directory, "runtime");
  const bin = join(directory, "bin");
  for (const path of [trusted, data, runtime, bin]) await mkdir(path);
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      [
        "-C",
        data,
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { encoding: "utf8" },
    ).trim();
  git("init", "--quiet");
  git("config", "user.name", "Review fixture");
  git("config", "user.email", "review@example.com");
  await writeFile(join(data, "feature.txt"), "before\n");
  await writeFile(join(data, "REVIEW.md"), "PR checklist is untrusted\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "fixture base");
  const base = git("rev-parse", "HEAD");
  await writeFile(join(data, "feature.txt"), "after\n");
  git("add", ".");
  git("commit", "--quiet", "-m", "fixture head");
  const head = git("rev-parse", "HEAD");
  await writeFile(join(trusted, "REVIEW.md"), "TRUSTED_CHECKLIST\n");
  await writeFile(
    join(runtime, "context.json"),
    JSON.stringify({ pr: { head, base }, issues: [] }),
  );
  const executable = join(bin, "opencode");
  await writeFile(
    executable,
    `#!${process.execPath}
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv[2] === '--version') {
  console.log('1.19.6');
  process.exit(0);
}
assert.deepEqual(process.argv.slice(2), ['run', '--agent', 'github-pr-review', '--model', 'opencode/glm-5.3-flash-free', '--format', 'json']);
for (const key of ['GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL']) {
  assert.equal(process.env[key], undefined, 'GitHub credential exposed to model child');
}
assert.match(readFileSync(0, 'utf8'), /TRUSTED_CHECKLIST/);
writeFileSync(join(process.env.GITHUB_AGENT_ROOT, 'model-invoked'), 'fake CLI only');
if (process.env.REVIEW_FAKE_DELAY || process.env.REVIEW_FAKE_FAILURE) {
  console.error('SYNTHETIC_SECRET_DO_NOT_LOG');
  console.log(JSON.stringify({ type: 'step_start' }));
}
if (process.env.REVIEW_FAKE_DELAY) await new Promise(resolve => setTimeout(resolve, 500));
if (process.env.REVIEW_FAKE_FAILURE) {
  console.log(JSON.stringify({ type: 'error', error: { name: 'APIError', data: { statusCode: 429, message: 'SYNTHETIC_SECRET_DO_NOT_LOG' } } }));
  process.exit(7);
}
console.log(JSON.stringify({ type: 'text', part: { text: JSON.stringify({ summary: 'No defects found.', findings: [] }) } }));
`,
  );
  await chmod(executable, 0o755);
  const env = {
    ...process.env,
    PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
    GITHUB_AGENT_ROOT: runtime,
    GITHUB_REVIEW_DIRECTORY: data,
    REVIEW_SHA: head,
    REVIEW_BASE: base,
    GITHUB_RUN_ATTEMPT: "1",
    OPENCODE_API_KEY: "fake-cli-only",
    GH_TOKEN: "fixture-gh",
    GITHUB_TOKEN: "fixture-github",
    ACTIONS_RUNTIME_TOKEN: "fixture-actions",
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: "fixture-oidc",
    ACTIONS_ID_TOKEN_REQUEST_URL: "https://fixture.invalid",
  };
  return { directory, trusted, runtime, head, base, env };
}

function run(
  script: string,
  state: Awaited<ReturnType<typeof fixture>>,
  overrides: Record<string, string> = {},
) {
  return spawnSync(process.execPath, [resolve("scripts", script)], {
    cwd: state.trusted,
    env: { ...state.env, ...overrides },
    encoding: "utf8",
    timeout: 5000,
  });
}

test("Trusted helpers build exact-head context and pass credential-free input to an isolated CLI", async () => {
  const state = await fixture();
  try {
    const input = run("pr-review-input.mjs", state);
    assert.equal(input.status, 0, input.stderr);
    const prompt = await readFile(join(state.runtime, "prompt.txt"), "utf8");
    assert.ok(prompt.includes(state.head));
    assert.match(prompt, /TRUSTED_CHECKLIST/);
    assert.ok(!prompt.includes("PR checklist is untrusted"));
    assert.match(prompt, /-before\n\+after/);
    const review = run("run-pr-review.mjs", state);
    assert.equal(review.status, 0, review.stderr);
    assert.deepEqual(
      JSON.parse(await readFile(join(state.runtime, "review.json"), "utf8")),
      {
        sha: state.head,
        review: { summary: "No defects found.", findings: [] },
      },
    );
    assert.equal(
      await readFile(join(state.runtime, "model-invoked"), "utf8"),
      "fake CLI only",
    );
  } finally {
    await rm(state.directory, { recursive: true, force: true });
  }
});

test("A rerun is rejected before the model process and produces no review artifact", async () => {
  const state = await fixture();
  try {
    const result = run("run-pr-review.mjs", state, { GITHUB_RUN_ATTEMPT: "2" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Duplicate review attempt refused/);
    for (const name of ["model-invoked", "review.json", "events.jsonl"]) {
      await assert.rejects(readFile(join(state.runtime, name)), {
        code: "ENOENT",
      });
    }
  } finally {
    await rm(state.directory, { recursive: true, force: true });
  }
});

test("A checkout or context SHA mismatch stops before creating model input", async () => {
  const state = await fixture();
  try {
    const checkout = run("pr-review-input.mjs", state, {
      REVIEW_SHA: "f".repeat(40),
    });
    assert.equal(checkout.status, 1);
    assert.match(checkout.stderr, /Wrong review checkout/);
    await writeFile(
      join(state.runtime, "context.json"),
      JSON.stringify({ pr: { head: state.head, base: "f".repeat(40) } }),
    );
    const context = run("pr-review-input.mjs", state);
    assert.equal(context.status, 1);
    assert.match(context.stderr, /Wrong PR base context/);
    await assert.rejects(readFile(join(state.runtime, "prompt.txt")), {
      code: "ENOENT",
    });
  } finally {
    await rm(state.directory, { recursive: true, force: true });
  }
});

async function modelStep(
  state: Awaited<ReturnType<typeof fixture>>,
  overrides: Record<string, string> = {},
  helperSource?: string,
) {
  assert.equal(run("pr-review-input.mjs", state).status, 0);
  await mkdir(join(state.trusted, "scripts"));
  const helper = join(state.trusted, "scripts/run-pr-review.mjs");
  if (helperSource === undefined)
    await copyFile(resolve("scripts/run-pr-review.mjs"), helper);
  else await writeFile(helper, helperSource);
  const workflow = parse(
    await readFile(".github/workflows/opencode-pr-review.yml", "utf8"),
  );
  const step = workflow.jobs.review.steps.find(
    (item: { id?: string }) => item.id === "model",
  );
  const script = join(state.directory, "model-step.sh");
  const clock = join(state.directory, "fast-clock.mjs");
  await writeFile(script, step.run);
  await writeFile(
    clock,
    "const original = globalThis.setInterval; globalThis.setInterval = (callback, ms, ...args) => original(callback, ms === 30000 ? 20 : ms, ...args);",
  );
  const child = spawn("bash", [script], {
    cwd: state.trusted,
    env: {
      ...state.env,
      ...overrides,
      GITHUB_OUTPUT: join(state.runtime, "github-output"),
      NODE_OPTIONS: `--import ${clock}`,
    },
  });
  let stdout = "";
  let stderr = "";
  let progressWhileActive = false;
  child.stdout.on("data", (data) => {
    stdout += data.toString();
    if (child.exitCode === null && /"events_bytes":\s*[1-9]/.test(stdout))
      progressWhileActive = true;
  });
  child.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  return { code, stdout, stderr, progressWhileActive, workflow };
}

test("The workflow reports safe progress while the review process is still working", async () => {
  const state = await fixture();
  try {
    const result = await modelStep(state, { REVIEW_FAKE_DELAY: "1" });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(
      result.progressWhileActive,
      true,
      "Working CLI must be visible before it exits",
    );
    assert.ok(!result.stdout.includes("SYNTHETIC_SECRET_DO_NOT_LOG"));
    const diagnostic = await readFile(
      join(state.runtime, "review-diagnostics.json"),
      "utf8",
    );
    assert.ok(!diagnostic.includes("SYNTHETIC_SECRET_DO_NOT_LOG"));
    const report = JSON.parse(diagnostic);
    assert.equal(report.sha, state.head);
    assert.equal(report.phase, "success");
    assert.ok(report.events_bytes > 0);
    assert.ok(report.stderr_bytes > 0);
  } finally {
    await rm(state.directory, { recursive: true, force: true });
  }
});

test("A failed CLI leaves useful diagnostic metadata without exposing its text", async () => {
  const state = await fixture();
  try {
    const result = await modelStep(state, { REVIEW_FAKE_FAILURE: "1" });
    assert.equal(result.code, 1);
    assert.ok(
      !(result.stdout + result.stderr).includes("SYNTHETIC_SECRET_DO_NOT_LOG"),
    );
    const diagnostic = await readFile(
      join(state.runtime, "review-diagnostics.json"),
      "utf8",
    );
    assert.ok(!diagnostic.includes("SYNTHETIC_SECRET_DO_NOT_LOG"));
    assert.ok(!diagnostic.includes("fake-cli-only"));
    const report = JSON.parse(diagnostic);
    assert.equal(report.phase, "failed");
    assert.equal(report.exit_code, 1);
    assert.equal(report.last_event_type, "error");
    assert.deepEqual(report.provider_error, {
      name: "APIError",
      status_code: 429,
    });
    await assert.rejects(readFile(join(state.runtime, "review.json")), {
      code: "ENOENT",
    });
  } finally {
    await rm(state.directory, { recursive: true, force: true });
  }
});

test("A trusted helper timeout is preserved as timeout metadata after the process exits", async () => {
  const state = await fixture();
  try {
    const helper =
      "import { appendFileSync } from 'node:fs'; appendFileSync(process.env.GITHUB_OUTPUT, 'timed_out=true\\n'); process.exitCode = 1;";
    const result = await modelStep(state, {}, helper);
    assert.equal(result.code, 1);
    const report = JSON.parse(
      await readFile(join(state.runtime, "review-diagnostics.json"), "utf8"),
    );
    assert.equal(report.phase, "timeout");
    assert.equal(report.timed_out, true);
    assert.equal(report.exit_code, 1);
    await assert.rejects(readFile(join(state.runtime, "model-invoked")), {
      code: "ENOENT",
    });
  } finally {
    await rm(state.directory, { recursive: true, force: true });
  }
});

test("The diagnostic artifact runs after failure and uploads only safe metadata", async () => {
  const workflow = parse(
    await readFile(".github/workflows/opencode-pr-review.yml", "utf8"),
  );
  const step = workflow.jobs.review.steps.find(
    (item: { id?: string }) => item.id === "review_diagnostics",
  );
  assert.ok(step);
  const condition = step.if.slice(3, -2).trim();
  const enabled = new Function(
    "steps",
    "always",
    "cancelled",
    `return (${condition});`,
  );
  for (const outcome of ["success", "failure"]) {
    assert.equal(
      enabled(
        { model: { outcome } },
        () => true,
        () => false,
      ),
      true,
    );
  }
  assert.equal(
    enabled(
      { model: { outcome: "skipped" } },
      () => true,
      () => false,
    ),
    false,
  );
  assert.equal(
    enabled(
      { model: { outcome: "failure" } },
      () => true,
      () => true,
    ),
    false,
  );
  assert.equal(
    step.with.path,
    "${{ env.GITHUB_AGENT_ROOT }}/review-diagnostics.json",
  );
});
