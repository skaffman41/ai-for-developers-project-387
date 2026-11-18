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

function allowsReviewJob(
  condition: string,
  outputs: Record<string, string>,
  attempt = 1,
) {
  return new Function("needs", "github", `return (${condition});`)(
    { authorize: { outputs } },
    { run_attempt: attempt },
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

async function authorize(
  pr = pull(),
  runs: unknown[] = [],
  attempt = "1",
  action = "synchronize",
) {
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
        action,
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
  report: {
    sha: string;
    text?: string;
    review?: { summary: string; findings: unknown[] };
  } = {
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

test("Publisher preserves a plain-text CLI review and binds it to the checked head", async () => {
  const text = "I have completed the review.\n\nNo confirmed defects found.";
  const comments = await publish(sha, { sha, text });
  assert.equal(comments.length, 1);
  assert.ok(comments[0].body.startsWith(text));
  assert.ok(comments[0].body.includes(sha));
  const stale = await publish("2".repeat(40), { sha, text });
  assert.equal(stale.length, 1);
  assert.ok(!stale[0].body.includes(text));
});

test("Publisher rejects empty, oversized or ambiguous text results", async () => {
  for (const report of [
    { sha, text: " " },
    { sha, text: "x".repeat(50001) },
    { sha, text: "Review", review: { summary: "Other review", findings: [] } },
  ]) {
    await assert.rejects(publish(sha, report));
  }
});

async function report(
  options: {
    conclusion?: string;
    model?: string;
    timedOut?: boolean;
    source?: string;
    currentSha?: string;
    author?: string;
    runName?: string;
    trigger?: Record<string, unknown>;
    attempt?: Record<string, unknown>;
    registry?: Record<string, unknown>;
    identityApiFailure?: "workflow" | "attempt";
    notices?: string[];
  } = {},
) {
  const config = parse(
    await readFile(".github/workflows/opencode-pr-review-report.yml", "utf8"),
  );
  const producer = {
    id: 100,
    run_attempt: 2,
    workflow_id: 9,
    name: options.runName ?? "opencode-pr-review",
    path: options.source ?? ".github/workflows/opencode-pr-review.yml",
    event: "pull_request",
    status: "completed",
    conclusion: options.conclusion ?? "failure",
    display_title: `opencode-review pr=71 sha=${sha}`,
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    ...options.trigger,
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
          getWorkflow: async () => {
            if (options.identityApiFailure === "workflow")
              throw new Error("GitHub API unavailable");
            return {
              data: {
                id: 9,
                path: ".github/workflows/opencode-pr-review.yml",
                name: "opencode-pr-review",
                ...options.registry,
              },
            };
          },
          getWorkflowRunAttempt: async () => {
            if (options.identityApiFailure === "attempt")
              throw new Error("GitHub API unavailable");
            return { data: { ...producer, ...options.attempt } };
          },
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
    { notice: (message: string) => options.notices?.push(message) },
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

test("Review completion accepts legacy and expanded run names for the registered workflow", async () => {
  for (const runName of [
    "opencode-pr-review",
    `opencode-review pr=71 sha=${sha}`,
  ]) {
    for (const [conclusion, reason] of [
      ["timed_out", "timeout"],
      ["failure", "infra"],
    ]) {
      const { comments } = await report({ conclusion, runName });
      assert.equal(comments.length, 1);
      assert.ok(comments[0].body.includes(reason));
    }
  }
});

test("Review completion stays silent for mismatched or ambiguous workflow identities", async () => {
  for (const options of [
    { trigger: { workflow_id: 8 } },
    { trigger: { workflow_id: undefined } },
    { trigger: { repository: { full_name: "outsider/repository" } } },
    { trigger: { head_repository: { full_name: "outsider/repository" } } },
    { trigger: { id: 0 } },
    { trigger: { run_attempt: 0 } },
    { registry: { id: undefined } },
    { registry: { id: 0 }, trigger: { workflow_id: 0 } },
    { registry: { path: ".github/workflows/other.yml" } },
    { registry: { name: "other" } },
    { attempt: { workflow_id: 8 } },
    { attempt: { workflow_id: undefined } },
    { attempt: { path: ".github/workflows/other.yml" } },
    { attempt: { id: 101 } },
    { attempt: { run_attempt: 1 } },
    { attempt: { display_title: `opencode-review pr=72 sha=${sha}` } },
    { attempt: { event: "issue_comment" } },
    { attempt: { repository: { full_name: "outsider/repository" } } },
    { attempt: { head_repository: { full_name: "outsider/repository" } } },
    { attempt: { status: "in_progress" } },
  ]) {
    assert.equal((await report(options)).comments.length, 0);
  }
});

test("Review identity API outages explain infra in Actions without publishing an unverified comment", async () => {
  for (const identityApiFailure of ["workflow", "attempt"] as const) {
    const notices: string[] = [];
    const { comments } = await report({ identityApiFailure, notices });
    assert.deepEqual(comments, []);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /infra/);
    assert.match(notices[0], /нужен человек/);
    assert.ok(notices[0].includes(sha));
    assert.match(notices[0], /actions\/runs\/100\/attempts\/2/);
  }
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
  const cached = { review_allowed: "true" };
  assert.equal(allowsReviewJob(config.jobs.review.if, cached), true);
  assert.equal(allowsReviewJob(config.jobs.review.if, cached, 2), false);
});

test("A reopened same-head PR is rejected before it can cancel the active review", async () => {
  const config = await workflow();
  const repeated = await authorize(
    pull(),
    [
      {
        id: 99,
        event: "pull_request",
        status: "in_progress",
        display_title: `opencode-review pr=71 sha=${sha}`,
      },
    ],
    "1",
    "reopened",
  );
  assert.equal(repeated.outputs.allowed, "true");
  assert.equal(repeated.outputs.review_allowed, undefined);
  assert.equal(allowsReviewJob(config.jobs.review.if, repeated.outputs), false);
  assert.equal(
    config.concurrency,
    undefined,
    "Workflow cancellation must not preempt admission of a same-head event",
  );
  assert.equal(config.jobs.review.needs, "authorize");
  assert.equal(config.jobs.review.concurrency["cancel-in-progress"], true);
});

test("A new head enters the PR review cancellation group after admission", async () => {
  const nextSha = "5".repeat(40);
  const nextPull = { ...pull(), head: { ...pull().head, sha: nextSha } };
  const admitted = await authorize(nextPull, [
    {
      id: 99,
      event: "pull_request",
      status: "in_progress",
      display_title: `opencode-review pr=71 sha=${sha}`,
    },
  ]);
  assert.equal(admitted.outputs.review_allowed, "true");
  assert.equal(admitted.outputs.head_sha, nextSha);
  const config = await workflow();
  assert.equal(allowsReviewJob(config.jobs.review.if, admitted.outputs), true);
  const cancellation = config.jobs.review.concurrency;
  assert.equal(cancellation["cancel-in-progress"], true);
  assert.match(cancellation.group, /github\.event\.pull_request\.number/);
  assert.doesNotMatch(cancellation.group, /head\.sha/);
  assert.equal(
    (await report({ conclusion: "cancelled", currentSha: nextSha })).comments
      .length,
    0,
  );
  assert.match(
    (await report({ conclusion: "cancelled" })).comments[0].body,
    /agent_failed/,
    "An actual cancellation of the current head still needs a human report",
  );
});

test("A head change during history pagination prevents stale admission after the newer review", async () => {
  const original = pull();
  const nextSha = "5".repeat(40);
  const next = { ...pull(), head: { ...pull().head, sha: nextSha } };
  let current = original;
  const outputs: Record<string, string> = {};
  let releaseHistory!: (runs: unknown[]) => void;
  let reachedHistory!: () => void;
  const history = new Promise<unknown[]>((resolve) => {
    releaseHistory = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    reachedHistory = resolve;
  });
  const config = await workflow();
  const oldAdmission = new AsyncFunction(
    "github",
    "context",
    "core",
    "process",
    config.jobs.authorize.steps[0].with.script,
  )(
    {
      rest: {
        pulls: { get: async () => ({ data: current }) },
        actions: { listWorkflowRuns: "workflow-runs" },
      },
      paginate: async () => {
        reachedHistory();
        return history;
      },
    },
    {
      eventName: "pull_request",
      runId: 100,
      repo: { owner: "skaffman41", repo: "ai-for-developers-project-387" },
      payload: {
        action: "synchronize",
        repository: { full_name: repository },
        pull_request: original,
      },
    },
    {
      setOutput: (name: string, value: string) => (outputs[name] = value),
      notice: () => {},
    },
    { env: { GITHUB_RUN_ATTEMPT: "1" } },
  );
  await waiting;
  current = next;
  const newer = await authorize(next);
  releaseHistory([]);
  await oldAdmission;
  assert.equal(newer.outputs.review_allowed, "true");
  assert.equal(newer.outputs.head_sha, nextSha);
  assert.equal(outputs.review_allowed, undefined);
  assert.equal(allowsReviewJob(config.jobs.review.if, outputs), false);
});

test("Review verification permits only read/glob/skill and preparation rejects a fork before network", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-config-"));
  try {
    const agent = {
      name: "github-pr-review",
      mode: "primary",
      model: { providerID: "opencode", modelID: "deepseek-v4.1-flash-free" },
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
