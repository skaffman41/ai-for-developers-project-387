import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parse } from "yaml";
import { test } from "vitest";

const repository = "skaffman41/ai-for-developers-project-387";
const sha = "4444444444444444444444444444444444444444";
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const require = createRequire(import.meta.url);

async function workflow() {
  return parse(
    await readFile(".github/workflows/opencode-pr-review.yml", "utf8"),
  );
}

function pull(login = "skaffman41", type = "User", fork = false) {
  return {
    number: 71,
    state: "open",
    user: { login, type },
    head: { sha, repo: { full_name: repository, fork } },
    base: { sha: "1".repeat(40), repo: { full_name: repository } },
  };
}

async function authorize(pr = pull(), runs: unknown[] = [], attempt = "1") {
  const outputs: Record<string, string> = {};
  const notices: string[] = [];
  const script = (await workflow()).jobs.authorize.steps[0].with.script;
  await new AsyncFunction("github", "context", "core", "process", script)(
    {
      rest: {
        pulls: { get: async () => ({ data: pr }) },
        actions: { listWorkflowRuns: "workflow-runs" },
      },
      paginate: async (endpoint: string, query: { event?: string }) => {
        assert.equal(endpoint, "workflow-runs");
        assert.equal(
          query.event,
          undefined,
          "Search filters cap Actions history at 1000",
        );
        return runs;
      },
    },
    {
      eventName: "pull_request",
      runId: 100,
      repo: { owner: "skaffman41", repo: "ai-for-developers-project-387" },
      payload: {
        action: "synchronize",
        repository: { full_name: repository },
        pull_request: pr,
      },
    },
    {
      setOutput: (name: string, value: string) => (outputs[name] = value),
      notice: (notice: string) => notices.push(notice),
    },
    { env: { GITHUB_RUN_ATTEMPT: attempt } },
  );
  return { outputs, notices };
}

test("Owner and the named App bot receive review; forks and other identities do not", async () => {
  for (const pr of [pull(), pull("opencode-agent[bot]", "Bot")]) {
    const { outputs } = await authorize(pr);
    assert.equal(outputs.allowed, "true");
    assert.equal(outputs.review_allowed, "true");
    assert.equal(outputs.head_sha, sha);
  }
  for (const pr of [
    pull("outsider"),
    pull("other[bot]", "Bot"),
    pull("skaffman41", "Bot"),
    pull("opencode-agent[bot]", "User"),
    pull("skaffman41", "User", true),
  ]) {
    const { outputs, notices } = await authorize(pr);
    assert.equal(outputs.allowed, undefined);
    assert.ok(notices.length);
  }
});

async function publish(
  currentSha = sha,
  report = {
    sha,
    review: { summary: "No defects found.", findings: [] },
  },
  entry = "review.json",
) {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-publication-"));
  try {
    await writeFile(join(directory, entry), JSON.stringify(report));
    execFileSync("zip", [
      "-q",
      "-j",
      join(directory, "result.zip"),
      join(directory, entry),
    ]);
    const archive = await readFile(join(directory, "result.zip"));
    const comments: { body: string }[] = [];
    const script = (await workflow()).jobs.publish.steps[0].with.script;
    await new AsyncFunction(
      "github",
      "context",
      "core",
      "process",
      "require",
      script,
    )(
      {
        rest: {
          pulls: {
            get: async () => ({
              data: { ...pull(), head: { ...pull().head, sha: currentSha } },
            }),
          },
          actions: {
            downloadArtifact: async () => ({ data: archive }),
            getWorkflowRunAttempt: async () => ({
              data: {
                id: 100,
                run_attempt: 1,
                path: ".github/workflows/opencode-pr-review.yml",
                event: "pull_request",
                display_title: `opencode-review pr=71 sha=${sha}`,
              },
            }),
          },
          issues: {
            createComment: async (comment: { body: string }) =>
              comments.push(comment),
          },
        },
        paginate: async () => [
          {
            id: 5,
            name: "pr-review-100-1",
            expired: false,
            size_in_bytes: archive.length,
            workflow_run: { id: 100 },
          },
        ],
      },
      {
        repo: { owner: "skaffman41", repo: "ai-for-developers-project-387" },
        runId: 100,
      },
      { notice: () => {} },
      {
        env: {
          RUNNER_TEMP: directory,
          GITHUB_RUN_ATTEMPT: "1",
          REVIEW_SHA: sha,
          REVIEW_NUMBER: "71",
        },
      },
      require,
    );
    return comments;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Publisher comments on the reviewed head and explains a stale result without approving", async () => {
  const comments = await publish();
  assert.equal(comments.length, 1);
  assert.match(comments[0].body, /No defects found/);
  assert.ok(comments[0].body.includes(`Проверенная версия: ${sha}`));
  const stale = await publish("2".repeat(40));
  assert.equal(stale.length, 1);
  assert.match(stale[0].body, /устарел/);
  assert.ok(!stale[0].body.includes("No defects found"));
  await assert.rejects(
    publish(sha, {
      sha: "2".repeat(40),
      review: { summary: "wrong", findings: [] },
    }),
    /SHA/,
  );
  await assert.rejects(publish(sha, undefined, "unexpected.json"), /entry/);
});

async function report(
  options: {
    conclusion?: string;
    model?: string;
    timedOut?: boolean;
    source?: string;
    currentSha?: string;
    author?: string;
  } = {},
) {
  const config = parse(
    await readFile(".github/workflows/opencode-pr-review-report.yml", "utf8"),
  );
  const producer = {
    id: 100,
    run_attempt: 2,
    workflow_id: 9,
    name: "opencode-pr-review",
    path: options.source ?? ".github/workflows/opencode-pr-review.yml",
    event: "pull_request",
    status: "completed",
    conclusion: options.conclusion ?? "failure",
    display_title: `opencode-review pr=71 sha=${sha}`,
    repository: { full_name: repository },
    head_repository: { full_name: repository },
  };
  const comments: { body: string }[] = [];
  await new AsyncFunction(
    "github",
    "context",
    "core",
    config.jobs.report.steps[0].with.script,
  )(
    {
      rest: {
        pulls: {
          get: async () => ({
            data: {
              ...pull(options.author),
              head: { ...pull().head, sha: options.currentSha ?? sha },
            },
          }),
        },
        actions: {
          getWorkflow: async () => ({
            data: {
              id: 9,
              path: ".github/workflows/opencode-pr-review.yml",
              name: "opencode-pr-review",
            },
          }),
          getWorkflowRunAttempt: async () => ({ data: producer }),
        },
        issues: {
          createComment: async (comment: { body: string }) =>
            comments.push(comment),
        },
      },
      paginate: async () => [
        {
          name: "Review PR",
          conclusion: options.conclusion ?? "failure",
          steps: [
            {
              name: "Run read-only review",
              conclusion: options.model ?? "skipped",
            },
            {
              name: "Read-only review timed out",
              conclusion: options.timedOut ? "failure" : "skipped",
            },
          ],
        },
      ],
    },
    {
      eventName: "workflow_run",
      repo: { owner: "skaffman41", repo: "ai-for-developers-project-387" },
      payload: {
        action: "completed",
        repository: { full_name: repository },
        workflow_run: producer,
      },
    },
    { notice: () => {} },
  );
  return { config, comments };
}

test("Independent reporter survives cancellation and explains failures of the exact attempt", async () => {
  for (const [options, reason] of [
    [{ conclusion: "timed_out" }, "timeout"],
    [{ model: "failure", timedOut: true }, "timeout"],
    [{ model: "failure" }, "agent_failed"],
    [{ conclusion: "cancelled" }, "agent_failed"],
    [{ model: "skipped" }, "infra"],
  ] as const) {
    const { config, comments } = await report(options);
    assert.equal(config.jobs.report["timeout-minutes"], 5);
    assert.deepEqual(config.on, {
      workflow_run: { workflows: ["opencode-pr-review"], types: ["completed"] },
    });
    assert.equal(config.jobs.report.steps.length, 1);
    assert.equal(comments.length, 1);
    assert.match(comments[0].body, new RegExp(reason));
    assert.match(comments[0].body, /нужен человек/);
    assert.ok(comments[0].body.includes(sha));
    assert.match(comments[0].body, /actions\/runs\/100\/attempts\/2/);
  }
  for (const options of [
    { conclusion: "success" },
    { source: ".github/workflows/other.yml" },
    { currentSha: "2".repeat(40) },
    { author: "outsider" },
  ])
    assert.equal((await report(options)).comments.length, 0);
});

test("Actions history suppresses a repeated PR/head and a rerun before the model job", async () => {
  const repeated = await authorize(pull(), [
    {
      id: 99,
      event: "pull_request",
      display_title: `opencode-review pr=71 sha=${sha}`,
    },
  ]);
  assert.equal(repeated.outputs.allowed, "true");
  assert.equal(repeated.outputs.review_allowed, undefined);
  const fresh = await authorize(pull(), [
    { id: 99, display_title: `opencode-review pr=71 sha=${"2".repeat(40)}` },
    { id: 100, display_title: `opencode-review pr=71 sha=${sha}` },
    { id: 101, display_title: `opencode-review pr=71 sha=${sha}` },
  ]);
  assert.equal(fresh.outputs.review_allowed, "true");
  assert.equal(
    (await authorize(pull(), [], "2")).outputs.review_allowed,
    undefined,
  );
  const config = await workflow();
  assert.deepEqual(config.on, {
    pull_request: { types: ["opened", "synchronize", "reopened"] },
  });
  assert.equal(config.jobs.review["timeout-minutes"], 30);
  assert.equal(
    (
      await authorize(
        pull(),
        Array.from({ length: 1001 }, (_, id) => ({ id })),
      )
    ).outputs.review_allowed,
    "true",
  );
  const allowed = new Function(
    "needs",
    "github",
    `return (${config.jobs.review.if});`,
  );
  const cached = { authorize: { outputs: { review_allowed: "true" } } };
  assert.equal(allowed(cached, { run_attempt: 1 }), true);
  assert.equal(allowed(cached, { run_attempt: 2 }), false);
});

test("Review verification permits only read/glob/skill and preparation rejects a fork before network", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-config-"));
  try {
    const agent = {
      name: "github-pr-review",
      mode: "primary",
      model: { providerID: "opencode", modelID: "glm-5.3-flash-free" },
      tools: {
        read: true,
        glob: true,
        skill: true,
        bash: false,
        edit: false,
        write: false,
        task: false,
      },
    };
    await writeFile(join(directory, "agent.json"), JSON.stringify(agent));
    await writeFile(join(directory, "discovery.json"), "[]");
    await writeFile(join(directory, "skills-lock.json"), '{"skills":[]}');
    const env = {
      ...process.env,
      GITHUB_AGENT_MODE: "pr-review",
      GITHUB_AGENT_ROOT: directory,
    };
    const verify = () =>
      spawnSync(
        process.execPath,
        [resolve("scripts/verify-github-agent.mjs")],
        { env, encoding: "utf8" },
      );
    assert.equal(verify().status, 0);
    await writeFile(
      join(directory, "agent.json"),
      JSON.stringify({ ...agent, tools: { ...agent.tools, bash: true } }),
    );
    const forbidden = verify();
    assert.equal(forbidden.status, 1);
    assert.match(forbidden.stderr, /Unexpected enabled tool.*bash/);
    const eventPath = join(directory, "event.json");
    await writeFile(
      eventPath,
      JSON.stringify({
        action: "opened",
        repository: { full_name: repository },
        pull_request: pull("skaffman41", "User", true),
      }),
    );
    const prepare = spawnSync(
      process.execPath,
      [resolve("scripts/prepare-github-agent.mjs")],
      {
        env: {
          ...env,
          RUNNER_TEMP: directory,
          GITHUB_ENV: join(directory, "env"),
          GITHUB_EVENT_PATH: eventPath,
          GITHUB_EVENT_NAME: "pull_request",
          GITHUB_REVIEW_DIRECTORY: join(directory, "data"),
        },
        encoding: "utf8",
        timeout: 5000,
      },
    );
    assert.equal(prepare.status, 1);
    assert.match(prepare.stderr, /!pr.head.repo.fork/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
