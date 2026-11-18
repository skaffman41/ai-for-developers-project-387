import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "vitest";
import { parse } from "yaml";

const model = { providerID: "opencode", modelID: "deepseek-v4.1-flash-free" };
const readTools = { read: true, glob: true, skill: true };

test.each([
  ["opencode.yml", "answer"],
  ["opencode-triage.yml", "triage"],
])(
  "%s passes the approved DeepSeek model to the pinned adapter",
  async (file, job) => {
    const workflow = parse(await readFile(`.github/workflows/${file}`, "utf8"));
    const adapter = workflow.jobs[job].steps.find((step: { uses?: string }) =>
      step.uses?.startsWith("anomalyco/opencode/github@"),
    );
    assert.equal(adapter.with.model, "opencode/deepseek-v4.1-flash-free");
  },
);

test("bootstrap accepts only the approved free DeepSeek catalog entry before runtime setup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "free-model-bootstrap-"));
  try {
    const checkout = join(directory, "checkout");
    const review = join(directory, "review-data");
    await mkdir(checkout);
    await mkdir(review);
    await writeFile(
      join(checkout, "skills-lock.json"),
      await readFile("skills-lock.json"),
    );
    // A deliberate unsafe review fixture stops preparation after the catalog
    // gate, before Git configuration, skill downloads or any model credentials.
    await symlink(checkout, join(review, "catalog-passed"));
    const eventPath = join(directory, "event.json");
    const envPath = join(directory, "github-env");
    const guardPath = join(directory, "catalog-api.mjs");
    const repository = {
      full_name: "skaffman41/ai-for-developers-project-387",
    };
    await writeFile(
      eventPath,
      JSON.stringify({
        action: "opened",
        repository,
        pull_request: {
          state: "open",
          user: { login: "skaffman41", type: "User" },
          head: { repo: { ...repository, fork: false } },
          base: { repo: repository },
        },
      }),
    );
    await writeFile(envPath, "");
    await writeFile(
      guardPath,
      `globalThis.fetch = async () => {
        const fixture = JSON.parse(process.env.MODEL_CATALOG_FIXTURE);
        if (fixture.offline) throw new Error('Model catalog offline');
        return { ok: fixture.status === 200, status: fixture.status,
          json: async () => ({ data: fixture.data }) };
      };`,
    );
    const approved = {
      id: model.modelID,
      capabilities: { tools: { supported: true } },
      cost: {
        text: { input: { price: 0, cache: { read: 0 } }, output: { price: 0 } },
      },
    };
    const prepare = (data: unknown[], status = 200, offline = false) =>
      spawnSync(
        process.execPath,
        ["--import", guardPath, resolve("scripts/prepare-github-agent.mjs")],
        {
          cwd: checkout,
          env: {
            ...process.env,
            OPENCODE_API_KEY: "",
            GH_TOKEN: "",
            GITHUB_TOKEN: "",
            RUNNER_TEMP: directory,
            GITHUB_ENV: envPath,
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_EVENT_NAME: "pull_request",
            GITHUB_AGENT_MODE: "pr-review",
            GITHUB_REVIEW_DIRECTORY: review,
            MODEL_CATALOG_FIXTURE: JSON.stringify({ data, status, offline }),
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
    const accepted = prepare([approved]);
    assert.match(
      accepted.stdout,
      /Configured model supports tools and has zero/,
    );
    assert.match(accepted.stderr, /Symlink in the bootstrap checkout/);
    assert.equal(accepted.status, 1); // Deliberate filesystem boundary, not inference.

    const retired = { ...approved, id: "glm-5.3-flash-free" };
    const paid = (field: "input" | "cache" | "output") => ({
      ...approved,
      cost: {
        text: {
          input: {
            price: field === "input" ? 1 : 0,
            cache: { read: field === "cache" ? 1 : 0 },
          },
          output: { price: field === "output" ? 1 : 0 },
        },
      },
    });
    for (const result of [
      prepare([]),
      prepare([retired]),
      prepare([approved, approved]),
      prepare([{ ...approved, capabilities: { tools: { supported: false } } }]),
      prepare([paid("input")]),
      prepare([paid("cache")]),
      prepare([paid("output"), retired]),
      prepare([{ ...approved, cost: {} }]),
      prepare([approved], 503),
      prepare([], 200, true),
    ]) {
      assert.equal(result.status, 1, result.stderr);
      assert.doesNotMatch(result.stdout, /Configured model supports tools/);
      assert.doesNotMatch(result.stderr, /Symlink in the bootstrap checkout/);
    }
    assert.equal(await readFile(envPath, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PR review verification accepts reading and rejects execution, edits and delegation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-bootstrap-"));
  try {
    const agent = {
      name: "github-pr-review",
      mode: "primary",
      model,
      tools: readTools,
    };
    await writeFile(join(directory, "discovery.json"), "[]");
    await writeFile(join(directory, "skills-lock.json"), '{"skills":[]}');
    const verify = async (tools: Record<string, boolean>) => {
      await writeFile(
        join(directory, "agent.json"),
        JSON.stringify({ ...agent, tools }),
      );
      return spawnSync(
        process.execPath,
        [resolve("scripts/verify-github-agent.mjs")],
        {
          env: {
            ...process.env,
            GITHUB_AGENT_MODE: "pr-review",
            GITHUB_AGENT_ROOT: directory,
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
    };
    const accepted = await verify(readTools);
    assert.equal(accepted.status, 0, accepted.stderr);
    for (const tool of ["bash", "write", "edit", "task", "webfetch"]) {
      const rejected = await verify({ ...readTools, [tool]: true });
      assert.equal(rejected.status, 1);
      assert.match(rejected.stderr, /Unexpected enabled tool/);
    }
    for (const tool of ["read", "glob", "skill"]) {
      assert.equal((await verify({ ...readTools, [tool]: false })).status, 1);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Review preparation rejects untrusted events before its first network request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pr-review-admission-"));
  try {
    const eventPath = join(directory, "event.json");
    const envPath = join(directory, "github-env");
    const guardPath = join(directory, "network-guard.mjs");
    const boundary = "MODEL_CATALOG_BOUNDARY";
    await writeFile(envPath, "");
    await writeFile(
      guardPath,
      `globalThis.fetch = async () => { throw new Error("${boundary}"); };`,
    );
    const prepare = async (
      event: unknown,
      mode = "pr-review",
      eventName = "pull_request",
    ) => {
      await writeFile(eventPath, JSON.stringify(event));
      return spawnSync(
        process.execPath,
        ["--import", guardPath, resolve("scripts/prepare-github-agent.mjs")],
        {
          env: {
            ...process.env,
            OPENCODE_API_KEY: "",
            GH_TOKEN: "",
            GITHUB_TOKEN: "",
            RUNNER_TEMP: directory,
            GITHUB_ENV: envPath,
            GITHUB_EVENT_PATH: eventPath,
            GITHUB_EVENT_NAME: eventName,
            GITHUB_AGENT_MODE: mode,
            GITHUB_REVIEW_DIRECTORY: join(directory, "review-data"),
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
    };
    const repository = {
      full_name: "skaffman41/ai-for-developers-project-387",
    };
    const pr = {
      state: "open",
      user: { login: "skaffman41", type: "User" },
      head: { repo: { ...repository, fork: false } },
      base: { repo: repository },
    };
    const event = { action: "opened", repository, pull_request: pr };
    for (const user of [
      pr.user,
      { login: "opencode-agent[bot]", type: "Bot" },
    ]) {
      const accepted = await prepare({
        ...event,
        pull_request: { ...pr, user },
      });
      assert.match(accepted.stderr, /MODEL_CATALOG_BOUNDARY/);
    }
    for (const rejected of [
      { ...event, action: "edited" },
      { ...event, repository: { full_name: "outsider/repository" } },
      { ...event, pull_request: { ...pr, state: "closed" } },
      ...[
        { login: "outsider", type: "User" },
        { login: "skaffman41", type: "Bot" },
        { login: "opencode-agent[bot]", type: "User" },
      ].map((user) => ({ ...event, pull_request: { ...pr, user } })),
      {
        ...event,
        pull_request: { ...pr, head: { repo: { ...repository, fork: true } } },
      },
      {
        ...event,
        pull_request: { ...pr, base: { repo: { full_name: "outsider/repo" } } },
      },
    ]) {
      const result = await prepare(rejected);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /AssertionError/);
      assert.ok(!result.stderr.includes(boundary));
    }
    for (const mode of ["read-only", "publish"]) {
      const body = mode === "publish" ? "/oc publish #28" : "/oc describe #28";
      const legacy = await prepare(
        { comment: { body } },
        mode,
        "issue_comment",
      );
      assert.match(legacy.stderr, /MODEL_CATALOG_BOUNDARY/);
    }
    assert.equal(await readFile(envPath, "utf8"), "");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
