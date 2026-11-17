import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { test } from "vitest";

const repository = "skaffman41/ai-for-developers-project-387";
const head = "4444444444444444444444444444444444444444";
const marker = `Record admitted manual attempt ${head}`;
const workflow = parse(
  await readFile(".github/workflows/opencode.yml", "utf8"),
);
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const context = {
  repo: { owner: "skaffman41", repo: "ai-for-developers-project-387" },
  runId: 100,
  eventName: "issue_comment",
  actor: "skaffman41",
  sha: head,
  payload: {
    action: "created",
    repository: { full_name: repository },
    sender: { login: "skaffman41" },
    issue: { number: 32, pull_request: {} },
    comment: {
      body: "/oc Read the PR",
      user: { login: "skaffman41", type: "User" },
    },
  },
};

function run(id: number, runAttempt = 1, event = "issue_comment") {
  return {
    id,
    run_attempt: runAttempt,
    event,
    display_title: "opencode manual #32",
    workflow_id: 17,
    path: ".github/workflows/opencode.yml",
    repository: { full_name: repository },
  };
}

function admissionJob(admitted = true) {
  return {
    name: "answer",
    status: "completed",
    steps: [{ name: marker, conclusion: admitted ? "success" : "skipped" }],
  };
}

async function budget(
  history: ReturnType<typeof run>[],
  jobs: Record<
    string,
    {
      name: string;
      status: string;
      steps?: { name: string; conclusion: string }[];
    }
  >,
  attempt = 1,
  options: {
    isPr?: boolean;
    apiFailure?: boolean;
    truncatedAt?: number;
    inconsistentTotal?: boolean;
  } = {},
) {
  const outputs: Record<string, string> = {};
  const step = workflow.jobs.answer.steps.find(
    (candidate: { id?: string }) => candidate.id === "budget",
  );
  assert.ok(
    step,
    "the serialized model job must check admission on every attempt",
  );
  await new AsyncFunction(
    "github",
    "context",
    "core",
    "process",
    step.with.script,
  )(
    {
      rest: {
        actions: {
          getWorkflowRun: async () => ({ data: run(100, attempt) }),
          listWorkflowRuns: async ({
            event,
            page,
            workflow_id,
          }: {
            event?: string;
            page: number;
            workflow_id: number;
          }) => {
            if (options.apiFailure) throw new Error("GitHub API unavailable");
            const runs = history.filter(
              (candidate) =>
                (event === undefined || candidate.event === event) &&
                candidate.workflow_id === workflow_id,
            );
            // The documented search filters cap a matching query at 1000 results.
            const visibleRuns =
              event === undefined ? runs : runs.slice(0, 1000);
            return {
              data: {
                total_count:
                  runs.length + (options.inconsistentTotal && page > 1 ? 1 : 0),
                workflow_runs: visibleRuns
                  .slice(0, options.truncatedAt ?? visibleRuns.length)
                  .slice((page - 1) * 100, page * 100),
              },
            };
          },
          listJobsForWorkflowRunAttempt: async ({
            run_id,
            attempt_number,
          }: {
            run_id: number;
            attempt_number: number;
          }) => {
            const job = jobs[`${run_id}:${attempt_number}`];
            assert.ok(
              job,
              `missing Actions job fixture ${run_id}:${attempt_number}`,
            );
            return { data: { total_count: 1, jobs: [job] } };
          },
        },
      },
    },
    context,
    { setOutput: (key: string, value: string) => (outputs[key] = value) },
    {
      env: {
        RUN_ATTEMPT: String(attempt),
        IS_PR: String(options.isPr ?? true),
      },
    },
  );
  return outputs;
}

test("the third admitted manual PR request passes, across both comment event types", async () => {
  assert.equal(
    (
      await budget(
        [run(90), run(91, 1, "pull_request_review_comment"), run(100)],
        { "90:1": admissionJob(), "91:1": admissionJob() },
      )
    ).admitted,
    "true",
  );
});

test("every rerun is admitted again, and the fourth attempt is refused before model access", async () => {
  assert.deepEqual(
    await budget(
      [run(100, 4)],
      {
        "100:1": admissionJob(),
        "100:2": admissionJob(),
        "100:3": admissionJob(),
      },
      4,
    ),
    { consumed: "3", limit_exhausted: "true" },
  );
});

test("rejected comments do not spend the PR budget", async () => {
  assert.deepEqual(
    await budget([run(90), run(91), run(92), run(93), run(100)], {
      "90:1": admissionJob(false),
      "91:1": admissionJob(false),
      "92:1": admissionJob(),
      "93:1": admissionJob(),
    }),
    { consumed: "2", admitted: "true" },
  );
});

test("a missing current run fails closed instead of undercounting concurrent history", async () => {
  await assert.rejects(budget([], {}), /current.*history/i);
});

test("the workflow keeps the number marker and admission within the serialized model job", () => {
  assert.equal(
    workflow["run-name"],
    "opencode manual #${{ github.event.issue.number || github.event.pull_request.number }}",
  );
  assert.equal(workflow.jobs.answer.concurrency["cancel-in-progress"], false);
  assert.equal(workflow.jobs.answer.concurrency.queue, "max");
  assert.equal(workflow.jobs.answer.permissions.actions, "read");
  const steps = workflow.jobs.answer.steps;
  assert.ok(
    steps.findIndex((step: { id?: string }) => step.id === "budget") <
      steps.findIndex((step: { uses?: string }) =>
        step.uses?.startsWith("actions/checkout@"),
      ),
  );
  assert.deepEqual(workflow.jobs.answer.needs, "authorize");
  assert.equal(
    workflow.jobs.answer.if,
    "needs.authorize.outputs.allowed == 'true'",
  );
  assert.equal(
    workflow.jobs.authorize.outputs.allowed,
    "${{ steps.context.outputs.allowed }}",
  );
  assert.equal(
    workflow.jobs.authorize.steps[0].with.script,
    steps[0].with.script,
  );
  assert.equal(
    steps.find((step: { id?: string }) => step.id === "opencode").if,
    "steps.budget.outputs.admitted == 'true'",
  );
});

test("the App token is refused before model access when it can mutate Actions history", async () => {
  const guard = workflow.jobs.answer.steps.find(
    (step: { id?: string }) => step.id === "app_permissions",
  );
  assert.ok(guard, "the adapter App needs its own permission check");
  const execute = new AsyncFunction("github", guard.with.script);
  const app = (actions: string) => ({
    rest: {
      apps: {
        getBySlug: async () => ({
          data: {
            id: 1549082,
            slug: "opencode-agent",
            permissions: { actions, contents: "write" },
          },
        }),
      },
    },
  });
  await execute(app("read"));
  await assert.rejects(execute(app("write")), /Actions|history/);
});

test.each([0, 1])(
  "the request after %i admitted attempts is allowed",
  async (count) => {
    const history = count === 0 ? [run(100)] : [run(90), run(100)];
    assert.equal(
      (await budget(history, { "90:1": admissionJob() })).admitted,
      "true",
    );
  },
);

test("Issue requests do not consume or depend on the PR budget", async () => {
  assert.deepEqual(
    await budget([], {}, 99, { isPr: false, apiFailure: true }),
    { admitted: "true" },
  );
});

test("pagination reads the complete workflow history and ignores other PR markers", async () => {
  const otherRuns = Array.from({ length: 100 }, (_, index) => ({
    ...run(index + 200),
    display_title: "opencode manual #999",
  }));
  assert.equal(
    (
      await budget([...otherRuns, run(90), run(100)], {
        "90:1": admissionJob(),
      })
    ).consumed,
    "1",
  );
});

test("a new PR remains eligible after 1001 unrelated workflow runs", async () => {
  const unrelated = Array.from({ length: 1001 }, (_, index) => ({
    ...run(index + 200),
    display_title: "opencode manual #999",
  }));
  assert.deepEqual(await budget([...unrelated, run(100)], {}), {
    consumed: "0",
    admitted: "true",
  });
});

test("truncated history, inconsistent totals and API errors still fail closed", async () => {
  const unrelated = Array.from({ length: 1001 }, (_, index) => ({
    ...run(index + 200),
    display_title: "opencode manual #999",
  }));
  const history = [...unrelated, run(100)];
  await assert.rejects(
    budget(history, {}, 1, { truncatedAt: 1000 }),
    /Truncated/,
  );
  await assert.rejects(
    budget(history, {}, 1, { inconsistentTotal: true }),
    /ambiguous/,
  );
  await assert.rejects(
    budget([run(100)], {}, 1, { apiFailure: true }),
    /unavailable/,
  );
});

async function authorize(eventContext: unknown) {
  const outputs: Record<string, string> = {};
  const step = workflow.jobs.answer.steps.find(
    (candidate: { id?: string }) => candidate.id === "context",
  );
  await new AsyncFunction("github", "context", "core", step.with.script)(
    {
      rest: {
        pulls: {
          get: async () => ({
            data: {
              state: "open",
              head: { sha: head, repo: { full_name: repository, fork: false } },
              base: { repo: { full_name: repository } },
            },
          }),
        },
      },
    },
    eventContext,
    {
      notice: () => {},
      setFailed: (message: string) => {
        throw new Error(message);
      },
      setOutput: (key: string, value: string) => (outputs[key] = value),
    },
  );
  return outputs;
}

test("both read-only and publish commands reach admission with the trusted head", async () => {
  assert.deepEqual(await authorize(context), {
    allowed: "true",
    is_pr: "true",
    mode: "read-only",
    head_sha: head,
  });
  const publish = structuredClone(context);
  publish.eventName = "pull_request_review_comment";
  publish.payload.comment.body = "/opencode publish Explicit task";
  assert.equal((await authorize(publish)).mode, "publish");
});

test.each(["bot", "other-owner", "no-command"])(
  "%s comments stay ordinary silent skips",
  async (kind) => {
    const skipped = structuredClone(context);
    if (kind === "bot") skipped.payload.comment.user.type = "Bot";
    if (kind === "other-owner") skipped.actor = "other-user";
    if (kind === "no-command")
      skipped.payload.comment.body = "A normal PR discussion";
    assert.deepEqual(await authorize(skipped), {});
  },
);

test("cancelled and timed-out admitted attempts spend budget regardless of model completion", async () => {
  const cancelled = { ...admissionJob(), conclusion: "cancelled" };
  const timedOut = { ...admissionJob(), conclusion: "timed_out" };
  assert.equal(
    (
      await budget([run(90), run(91), run(100)], {
        "90:1": cancelled,
        "91:1": timedOut,
      })
    ).consumed,
    "2",
  );
});

test("missing step history cannot turn an unknown attempt into a free model run", async () => {
  await assert.rejects(
    budget([run(90), run(100)], {
      "90:1": { name: "answer", status: "completed" },
    }),
    /Ambiguous|Incomplete/,
  );
});

test("automatic PR reviews never spend manual admission budget", async () => {
  const review = {
    ...run(90, 5),
    workflow_id: 18,
    path: ".github/workflows/opencode-pr-review.yml",
  };
  assert.deepEqual(await budget([review, run(100)], {}), {
    consumed: "0",
    admitted: "true",
  });
});

test("unfiltered history still selects only the two manual comment event types locally", async () => {
  assert.deepEqual(await budget([run(90, 5, "pull_request"), run(100)], {}), {
    consumed: "0",
    admitted: "true",
  });
});
