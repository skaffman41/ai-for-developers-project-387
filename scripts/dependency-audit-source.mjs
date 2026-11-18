import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { closeSync, openSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const hash = (/** @type {Buffer} */ data) =>
  createHash("sha256").update(data).digest("hex");

/** Read only the two known data entries from one independently verified Actions artifact. */
async function replay(
  /** @type {string} */ directory,
  /** @type {Record<string, unknown>} */ provenance,
) {
  const repository = "skaffman41/ai-for-developers-project-387";
  const runId = process.env.DEPENDENCY_AUDIT_SOURCE_RUN ?? "";
  const attempt = process.env.DEPENDENCY_AUDIT_SOURCE_ATTEMPT ?? "";
  for (const value of [runId, attempt]) {
    assert.match(value, /^[1-9]\d*$/, "Replay needs an exact run and attempt");
    assert.ok(Number.isSafeInteger(Number(value)));
  }
  assert.notEqual(
    runId,
    process.env.GITHUB_RUN_ID,
    "Select an earlier source run",
  );
  const deadline = Date.now() + 90_000;
  /** @param {string} name @param {string[]} args @param {number} maximum */
  function execute(name, args, maximum = 20_000) {
    const remaining = deadline - Date.now();
    assert.ok(remaining > 0, "Replay source deadline exceeded");
    const result = spawnSync(name, args, {
      timeout: Math.min(remaining, maximum),
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(result.status, 0, "Replay source unavailable or invalid");
    return result.stdout;
  }
  /** @param {string} endpoint @param {boolean} [paginate] */
  function api(endpoint, paginate = false) {
    return JSON.parse(
      execute(
        "gh",
        [
          "api",
          ...(paginate ? ["--paginate", "--slurp"] : []),
          `repos/${repository}/${endpoint}`,
        ],
        15_000,
      ).toString("utf8"),
    );
  }
  const run = api(`actions/runs/${runId}/attempts/${attempt}`);
  assert.ok(
    run.id === Number(runId) && run.run_attempt === Number(attempt),
    "Source attempt mismatch",
  );
  assert.ok(
    run.repository?.full_name === repository &&
      run.head_repository?.full_name === repository &&
      !run.head_repository.fork,
    "Source repository mismatch",
  );
  assert.ok(
    run.path === ".github/workflows/dependency-audit.yml" &&
      run.head_branch === "main" &&
      ["schedule", "workflow_dispatch"].includes(run.event) &&
      run.status === "completed",
    "Source must be a completed main audit",
  );
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  const pages = api(`actions/runs/${runId}/artifacts?per_page=100`, true);
  // gh paginates an object response as {artifacts: []} pages.
  assert.ok(
    Array.isArray(pages) &&
      pages.every((page) => Array.isArray(page.artifacts)),
    "Invalid artifact inventory",
  );
  const matches = pages
    .flatMap((page) => page.artifacts)
    .filter(
      (item) =>
        item.name === `dependency-audit-${runId}-${attempt}` &&
        !item.expired &&
        item.workflow_run?.id === Number(runId) &&
        item.workflow_run.head_sha === run.head_sha,
    );
  assert.equal(matches.length, 1, "Exact retained source artifact unavailable");
  const artifact = matches[0];
  assert.ok(
    Number.isSafeInteger(artifact.id) &&
      artifact.id > 0 &&
      artifact.size_in_bytes > 0 &&
      artifact.size_in_bytes <= 64 * 1024 * 1024,
    "Invalid source artifact",
  );
  const archive = execute("gh", [
    "api",
    `repos/${repository}/actions/artifacts/${artifact.id}/zip`,
  ]);
  assert.ok(archive.length <= 64 * 1024 * 1024);
  const archivePath = join(directory, "source-artifact.zip");
  await writeFile(archivePath, archive);
  const entries = execute("unzip", ["-Z1", archivePath], 5000)
    .toString("utf8")
    .trim()
    .split("\n");
  for (const name of ["audit-report.json", "provenance.json"])
    assert.equal(
      entries.filter((entry) => entry === name).length,
      1,
      "Missing or duplicate source entry",
    );
  // Never extract paths, source, configuration or executables from the archive.
  const raw = execute("unzip", ["-p", archivePath, "audit-report.json"], 5000);
  const originalBytes = execute(
    "unzip",
    ["-p", archivePath, "provenance.json"],
    5000,
  );
  assert.ok(originalBytes.length < 20_000 && raw.length > 0);
  const original = JSON.parse(originalBytes.toString("utf8"));
  assert.ok(
    original.schemaVersion === 2 &&
      original.repository === repository &&
      original.runId === runId &&
      original.runAttempt === attempt,
    "Source provenance mismatch",
  );
  assert.equal(
    original.reportValidated,
    true,
    "Source acquisition was not validated",
  );
  assert.ok(
    !original.replay,
    "Select the original acquisition run, not a replay",
  );
  assert.equal(
    original.sha,
    run.head_sha,
    "Source checkout must match the main event revision",
  );
  assert.ok(
    ["real", "educational"].includes(original.dataType),
    "Invalid source data type",
  );
  assert.equal(
    original.runUrl,
    `https://github.com/${repository}/actions/runs/${runId}`,
  );
  assert.equal(original.reportSha256, hash(raw), "Source report bytes changed");
  const lock = api(`contents/package-lock.json?ref=${original.sha}`);
  assert.equal(lock.encoding, "base64", "Source lockfile unavailable");
  assert.equal(
    original.lockfileSha256,
    hash(Buffer.from(lock.content, "base64")),
    "Source lockfile mismatch",
  );
  const execution = {
    runId: provenance.runId,
    runAttempt: provenance.runAttempt,
    runUrl: provenance.runUrl,
    checkoutSha: provenance.sha,
    sourceRunId: runId,
    sourceRunAttempt: attempt,
    artifactId: artifact.id,
  };
  Object.assign(provenance, original, { replay: execution });
  await writeFile(join(directory, "source-provenance.json"), originalBytes);
  await writeFile(join(directory, "audit-report.json"), raw);
}

/** Obtain source bytes only; no inference or Issue mutations. */
export async function acquireSource(
  /** @type {string} */ directory,
  /** @type {Record<string, unknown>} */ provenance,
) {
  const mode = process.env.DEPENDENCY_AUDIT_INPUT || "real";
  assert.ok(
    ["real", "educational", "replay"].includes(mode),
    "Invalid audit input",
  );
  if (mode !== "replay") {
    assert.ok(
      !process.env.DEPENDENCY_AUDIT_SOURCE_RUN &&
        !process.env.DEPENDENCY_AUDIT_SOURCE_ATTEMPT,
      "Replay source requires replay mode",
    );
  }
  if (mode === "replay") return replay(directory, provenance);
  if (mode === "educational") {
    provenance.dataType = "educational";
    provenance.source =
      "Учебный отчёт, созданный во время запуска; не дефект приложения и не запрос registry";
    const name = "dependency-audit-educational-example";
    await writeFile(
      join(directory, "audit-report.json"),
      JSON.stringify(
        {
          dependencyAudit: {
            dataType: "educational",
            description:
              "Учебные синтетические данные; дефект календаря не утверждается",
          },
          auditReportVersion: 2,
          vulnerabilities: {
            [name]: {
              severity: "high",
              range: "<2.0.0",
              nodes: [`educational/${name}`],
              fixAvailable: false,
              via: [
                {
                  source: 999999999,
                  title:
                    "Учебная синтетическая находка для проверки публикации",
                  url: "https://github.com/skaffman41/ai-for-developers-project-387/issues/53",
                  severity: "high",
                },
              ],
            },
          },
          metadata: {
            vulnerabilities: {
              info: 0,
              low: 0,
              moderate: 0,
              high: 1,
              critical: 0,
              total: 1,
            },
          },
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }
  const output = openSync(join(directory, "audit-report.json"), "w");
  const errors = openSync(join(directory, "npm.stderr"), "w");
  let result;
  try {
    result = spawnSync(
      "npm",
      [
        "audit",
        "--json",
        "--package-lock-only",
        "--workspaces",
        "--include-workspace-root",
        "--include=dev",
      ],
      {
        stdio: ["ignore", output, errors],
        timeout: 90_000,
        killSignal: "SIGKILL",
      },
    );
  } finally {
    closeSync(output);
    closeSync(errors);
  }
  await writeFile(
    join(directory, "npm-execution.json"),
    JSON.stringify(
      {
        status: result.status,
        signal: result.signal,
        errorCode:
          result.error && "code" in result.error ? result.error.code : null,
      },
      null,
      2,
    ) + "\n",
  );
  const raw = await readFile(join(directory, "audit-report.json"));
  provenance.reportSha256 = hash(raw);
  const report = JSON.parse(raw.toString("utf8"));
  assert.ok(
    result.status === 0 ||
      (result.status === 1 && report.metadata?.vulnerabilities?.total > 0),
    "npm audit failed",
  );
}
