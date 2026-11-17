import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "vitest";

const model = { providerID: "opencode", modelID: "glm-5.3-flash-free" };
const readTools = { read: true, glob: true, skill: true };

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
