import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { test } from "vitest";

const repository = "skaffman41/ai-for-developers-project-387";
const head = "4444444444444444444444444444444444444444";
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;

type Step = { name: string; conclusion: string };

async function report(
  conclusion: string,
  steps: Step[],
  existingComments: unknown[] = [],
  options: {
    answerConclusion?: string;
    preflightSteps?: Step[];
    apiFailure?: boolean;
    runName?: string;
    trigger?: Record<string, unknown>;
    attempt?: Record<string, unknown>;
    registry?: Record<string, unknown>;
    identityApiFailure?: "workflow" | "attempt";
    notices?: string[];
  } = {},
) {
  const source = {
    id: 100,
    run_attempt: 2,
    workflow_id: 8,
    name: options.runName ?? "opencode",
    path: ".github/workflows/opencode.yml",
    event: "issue_comment",
    display_title: "opencode manual #32",
    head_sha: "1111111111111111111111111111111111111111",
    head_repository: { full_name: repository },
    repository: { full_name: repository },
    status: "completed",
    conclusion,
    ...options.trigger,
  };
  const workflow = parse(
    await readFile(".github/workflows/opencode-report.yml", "utf8"),
  );
  const script = workflow.jobs.report.steps[0].with.script;
  const comments: { body: string; issue_number: number }[] = [];
  await new AsyncFunction("github", "context", "core", script)(
    {
      rest: {
        actions: {
          getWorkflow: async () => {
            if (options.identityApiFailure === "workflow")
              throw new Error("GitHub API unavailable");
            return {
              data: {
                id: 8,
                name: "opencode",
                path: ".github/workflows/opencode.yml",
                ...options.registry,
              },
            };
          },
          getWorkflowRunAttempt: async () => {
            if (options.identityApiFailure === "attempt")
              throw new Error("GitHub API unavailable");
            return { data: { ...source, ...options.attempt } };
          },
          listJobsForWorkflowRunAttempt: async () => {
            if (options.apiFailure) throw new Error("GitHub API unavailable");
            return {
              data: {
                total_count: options.preflightSteps ? 2 : 1,
                jobs: [
                  {
                    name: "answer",
                    status: "completed",
                    conclusion: options.answerConclusion ?? conclusion,
                    steps,
                  },
                  ...(options.preflightSteps
                    ? [
                        {
                          name: "authorize",
                          status: "completed",
                          conclusion: "success",
                          steps: options.preflightSteps,
                        },
                      ]
                    : []),
                ],
              },
            };
          },
        },
        issues: {
          listComments: async () => ({ data: existingComments }),
          createComment: async (comment: {
            body: string;
            issue_number: number;
          }) => comments.push(comment),
        },
      },
    },
    {
      repo: { owner: "skaffman41", repo: "ai-for-developers-project-387" },
      payload: { repository: { full_name: repository }, workflow_run: source },
    },
    { notice: (message: string) => options.notices?.push(message) },
  );
  return comments;
}

const admitted = {
  name: `Record admitted manual attempt ${head}`,
  conclusion: "success",
};

test("a separate reporter survives the model job timeout and identifies its admitted head", async () => {
  const comments = await report("timed_out", [admitted]);
  assert.equal(comments.length, 1);
  assert.equal(comments[0]!.issue_number, 32);
  assert.match(comments[0]!.body, /timeout/);
  assert.match(comments[0]!.body, new RegExp(head));
  assert.match(comments[0]!.body, /actions\/runs\/100\/attempts\/2/);
  assert.match(comments[0]!.body, /нужен человек/);
});

test("manual completion accepts legacy and expanded run names for the registered workflow", async () => {
  for (const runName of ["opencode", "opencode manual #32"]) {
    for (const [conclusion, reason] of [
      ["timed_out", "timeout"],
      ["failure", "infra"],
    ]) {
      const comments = await report(conclusion, [admitted], [], { runName });
      assert.equal(comments.length, 1);
      assert.ok(comments[0]!.body.includes(reason));
    }
  }
});

test("manual completion stays silent for mismatched or ambiguous workflow identities", async () => {
  for (const options of [
    { trigger: { workflow_id: 9 } },
    { trigger: { workflow_id: undefined } },
    { trigger: { path: ".github/workflows/other.yml" } },
    { trigger: { repository: { full_name: "outsider/repository" } } },
    { trigger: { head_repository: { full_name: "outsider/repository" } } },
    { registry: { id: undefined } },
    { registry: { id: 0 }, trigger: { workflow_id: 0 } },
    { registry: { path: ".github/workflows/other.yml" } },
    { registry: { name: "other" } },
    { attempt: { workflow_id: 9 } },
    { attempt: { workflow_id: undefined } },
    { attempt: { path: ".github/workflows/other.yml" } },
    { attempt: { id: 101 } },
    { attempt: { run_attempt: 1 } },
    { attempt: { display_title: "opencode manual #33" } },
    { attempt: { event: "pull_request" } },
    { attempt: { repository: { full_name: "outsider/repository" } } },
    { attempt: { head_repository: { full_name: "outsider/repository" } } },
    { attempt: { status: "in_progress" } },
    { attempt: { conclusion: undefined } },
  ]) {
    assert.deepEqual(await report("failure", [admitted], [], options), []);
  }
});

test("manual identity API outages explain infra in Actions without publishing an unverified comment", async () => {
  for (const identityApiFailure of ["workflow", "attempt"] as const) {
    const notices: string[] = [];
    assert.deepEqual(
      await report("failure", [admitted], [], { identityApiFailure, notices }),
      [],
    );
    assert.equal(notices.length, 1);
    assert.match(notices[0]!, /infra/);
    assert.match(notices[0]!, /нужен человек/);
    assert.match(notices[0]!, /1111111111111111111111111111111111111111/);
    assert.match(notices[0]!, /actions\/runs\/100\/attempts\/2/);
  }
});

test.each([
  [
    "failure",
    [{ name: "Reject exhausted manual budget", conclusion: "failure" }],
    "limit_exhausted",
  ],
  [
    "failure",
    [
      admitted,
      {
        name: "Run the official OpenCode GitHub adapter",
        conclusion: "failure",
      },
    ],
    "agent_failed",
  ],
  [
    "failure",
    [
      admitted,
      {
        name: "Checkout trusted bootstrap from the default branch",
        conclusion: "failure",
      },
    ],
    "infra",
  ],
  ["cancelled", [admitted], "infra"],
] as const)(
  "reporter explains %s outcome as %s",
  async (conclusion, steps, reason) => {
    const comments = await report(conclusion, [...steps]);
    assert.equal(comments.length, 1);
    assert.match(comments[0]!.body, new RegExp(`\\*\\*${reason}\\*\\*`));
    assert.match(comments[0]!.body, /нужен человек/);
  },
);

test("successful agent responses and ordinary authorization skips stay silent", async () => {
  assert.deepEqual(await report("success", [admitted]), []);
  assert.deepEqual(
    await report("success", [
      {
        name: "Authorize the comment before checkout or model secrets",
        conclusion: "success",
      },
      {
        name: "Check the manual PR budget inside the model queue",
        conclusion: "skipped",
      },
    ]),
    [],
  );
});

test("rerunning the reporter does not duplicate an existing failure notification", async () => {
  assert.deepEqual(
    await report(
      "timed_out",
      [admitted],
      [
        {
          user: { login: "github-actions[bot]", type: "Bot" },
          body: "<!-- opencode-manual-report:100:2 -->\nPrior timeout notification",
        },
      ],
    ),
    [],
  );
});

test("the reporter has its own timeout and requires no checkout, runtime or model secret", async () => {
  const source = await readFile(
    ".github/workflows/opencode-report.yml",
    "utf8",
  );
  const workflow = parse(source);
  assert.deepEqual(workflow.on, {
    workflow_run: { workflows: ["opencode"], types: ["completed"] },
  });
  assert.equal(workflow.jobs.report["timeout-minutes"], 5);
  assert.equal(workflow.jobs.report.permissions.actions, "read");
  assert.doesNotMatch(
    source,
    /secrets\.|actions\/checkout|anomalyco\/opencode|OPENCODE_API_KEY/,
  );
});

test("a normal preflight skip stays silent without ever entering the model queue", async () => {
  assert.deepEqual(
    await report("success", [], [], {
      answerConclusion: "skipped",
      preflightSteps: [
        {
          name: "Authorize the comment before checkout or model secrets",
          conclusion: "success",
        },
        {
          name: "Owner command eligible for manual queue",
          conclusion: "skipped",
        },
      ],
    }),
    [],
  );
});

test("unavailable job diagnostics after trusted identity produce an infrastructure comment", async () => {
  const comments = await report("failure", [], [], { apiFailure: true });
  assert.match(comments[0]!.body, /\*\*infra\*\*/);
});

test("a successful response stays silent even if the history API is unavailable", async () => {
  assert.deepEqual(
    await report("success", [admitted], [], { apiFailure: true }),
    [],
  );
});
