import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "vitest";

test("Audit bootstrap admits schedule/dispatch only on main in the target repository, before its first network request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-bootstrap-"));
  try {
    const guard = join(directory, "network.mjs");
    const event = join(directory, "event.json");
    await writeFile(
      guard,
      'globalThis.fetch = async () => { throw new Error("CATALOG_BOUNDARY"); };',
    );
    for (const [eventName, ref, repository, admitted] of [
      [
        "schedule",
        "refs/heads/main",
        "skaffman41/ai-for-developers-project-387",
        true,
      ],
      [
        "workflow_dispatch",
        "refs/heads/main",
        "skaffman41/ai-for-developers-project-387",
        true,
      ],
      [
        "workflow_dispatch",
        "refs/heads/other",
        "skaffman41/ai-for-developers-project-387",
        false,
      ],
      [
        "issue_comment",
        "refs/heads/main",
        "skaffman41/ai-for-developers-project-387",
        false,
      ],
      ["schedule", "refs/heads/main", "other/repository", false],
    ] as const) {
      await writeFile(
        event,
        JSON.stringify({ repository: { full_name: repository } }),
      );
      const result = spawnSync(
        process.execPath,
        ["--import", guard, resolve("scripts/prepare-github-agent.mjs")],
        {
          env: {
            ...process.env,
            RUNNER_TEMP: directory,
            GITHUB_ENV: join(directory, "env"),
            GITHUB_EVENT_PATH: event,
            GITHUB_EVENT_NAME: eventName,
            GITHUB_REF: ref,
            GITHUB_AGENT_MODE: "audit",
            DEPENDENCY_AUDIT_DIRECTORY: join(directory, "data"),
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
      assert.equal(result.status, 1);
      assert.equal(
        result.stderr.includes("CATALOG_BOUNDARY"),
        admitted,
        result.stderr,
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Audit runtime verification permits only read/glob/skill and signals readiness after successful verification", async () => {
  const directory = await mkdtemp(join(tmpdir(), "audit-permissions-"));
  try {
    await writeFile(join(directory, "skills-lock.json"), '{"skills":[]}');
    await writeFile(join(directory, "discovery.json"), "[]");
    const tools = { read: true, glob: true, skill: true };
    for (const unexpected of [
      "bash",
      "write",
      "edit",
      "task",
      "webfetch",
      "mcp",
      undefined,
    ]) {
      await writeFile(
        join(directory, "agent.json"),
        JSON.stringify({
          name: "dependency-auditor",
          mode: "primary",
          model: {
            providerID: "opencode",
            modelID: "deepseek-v4.1-flash-free",
          },
          tools: unexpected ? { ...tools, [unexpected]: true } : tools,
        }),
      );
      const result = spawnSync(
        process.execPath,
        [resolve("scripts/verify-github-agent.mjs")],
        {
          env: {
            ...process.env,
            GITHUB_AGENT_MODE: "audit",
            GITHUB_AGENT_ROOT: directory,
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
      assert.equal(result.status, unexpected ? 1 : 0, result.stderr);
    }
    assert.deepEqual(
      JSON.parse(await readFile(join(directory, "audit-ready.json"), "utf8")),
      {
        mode: "audit",
        runtime: "1.19.6",
        model: "opencode/deepseek-v4.1-flash-free",
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
