import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "vitest";

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
