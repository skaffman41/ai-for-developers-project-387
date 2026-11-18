import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

const sha = "a".repeat(40);

async function review(response: string, mode = "success") {
  const directory = await mkdtemp(join(tmpdir(), "review-output-"));
  try {
    const runtime = join(directory, "runtime");
    const data = join(directory, "data");
    const bin = join(directory, "bin");
    for (const path of [runtime, data, bin]) await mkdir(path);
    await writeFile(join(runtime, "prompt.txt"), "Synthetic fixture only");
    await writeFile(join(runtime, "response.txt"), response);
    const cli = join(bin, "opencode");
    await writeFile(
      cli,
      `#!${process.execPath}
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
if (process.argv[2] === '--version') { console.log('1.19.6'); process.exit(0); }
for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL']) assert.equal(process.env[name], undefined);
if (process.env.REVIEW_OUTPUT_FIXTURE_MODE === 'exit_failure') process.exit(7);
if (process.env.REVIEW_OUTPUT_FIXTURE_MODE === 'model_error') console.log(JSON.stringify({ type: 'error', error: { name: 'APIError', data: { statusCode: 429 } } }));
if (process.env.REVIEW_OUTPUT_FIXTURE_MODE === 'multipart') {
  for (const part of [
    { id: 'old', messageID: 'earlier', text: 'Intermediate notes must not be published' },
    { id: 'finding', messageID: 'final', text: 'Old version of the finding' },
    { id: 'finding', messageID: 'final', text: 'README.md:42 - Conditions: documented command is wrong. Consequences: setup fails.' },
  ]) console.log(JSON.stringify({ type: 'text', part }));
}
console.log(JSON.stringify({ type: 'text', part: { id: 'summary', messageID: 'final', text: readFileSync(join(process.env.GITHUB_AGENT_ROOT, 'response.txt'), 'utf8') } }));
`,
    );
    await chmod(cli, 0o755);
    const result = spawnSync(
      process.execPath,
      [resolve("scripts/run-pr-review.mjs")],
      {
        env: {
          ...process.env,
          PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
          GITHUB_AGENT_ROOT: runtime,
          GITHUB_REVIEW_DIRECTORY: data,
          REVIEW_SHA: sha,
          GITHUB_RUN_ATTEMPT: "1",
          OPENCODE_API_KEY: "synthetic-no-model",
          GH_TOKEN: "must-not-reach-cli",
          GITHUB_TOKEN: "must-not-reach-cli",
          REVIEW_OUTPUT_FIXTURE_MODE: mode,
        },
        encoding: "utf8",
        timeout: 5000,
      },
    );
    let report:
      | {
          sha: string;
          text?: string;
          review?: { summary: string; findings: unknown[] };
        }
      | undefined;
    try {
      report = JSON.parse(await readFile(join(runtime, "review.json"), "utf8"));
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ))
        throw error;
    }
    return { ...result, report };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("Ordinary CLI prose is preserved as text without inventing an empty findings list", async () => {
  const text = "I have completed the review.\n\nNo confirmed defects found.";
  const result = await review(text);
  assert.equal(result.status, 0, result.stderr.slice(-700));
  assert.deepEqual(result.report, { sha, text });
});

test("Structured JSON reviews remain compatible", async () => {
  const payload = { summary: "No confirmed defects found.", findings: [] };
  const result = await review(JSON.stringify(payload));
  assert.equal(result.status, 0, result.stderr.slice(-700));
  assert.deepEqual(result.report, { sha, review: payload });
});

test("A complete JSON code fence is validated as structured output", async () => {
  const payload = { summary: "No confirmed defects found.", findings: [] };
  const result = await review("```json\n" + JSON.stringify(payload) + "\n```");
  assert.equal(result.status, 0, result.stderr.slice(-700));
  assert.deepEqual(result.report, { sha, review: payload });
});

test("All final-message text parts are kept, with updates deduplicated and earlier messages excluded", async () => {
  const result = await review("Review complete.", "multipart");
  assert.equal(result.status, 0, result.stderr.slice(-700));
  assert.equal(
    result.report?.text,
    "README.md:42 - Conditions: documented command is wrong. Consequences: setup fails.\n\nReview complete.",
  );
});

test("Malformed or invalid structured reviews are not downgraded to plain text", async () => {
  for (const response of [
    "{broken",
    "```json\n{broken\n```",
    '```json\n{"summary":"Partial review","findings":[',
    '```\n{"summary":"Partial review"',
    JSON.stringify({ summary: "", findings: [] }),
    JSON.stringify({
      summary: "Defect",
      findings: [
        { file: "../outside", line: 1, conditions: "x", consequences: "y" },
      ],
    }),
  ]) {
    const result = await review(response);
    assert.equal(result.status, 1);
    assert.equal(result.report, undefined);
  }
});

test("CLI and provider failures cannot become successful text reviews", async () => {
  for (const mode of ["exit_failure", "model_error"]) {
    const result = await review("No confirmed defects found.", mode);
    assert.equal(result.status, 1);
    assert.equal(result.report, undefined);
  }
});

test("Text output is bounded by UTF-8 bytes for the artifact consumer", async () => {
  const accepted = await review("\u0442".repeat(10000));
  assert.equal(accepted.status, 0, accepted.stderr.slice(-700));
  for (const text of ["", "\u0442".repeat(28000)]) {
    const rejected = await review(text);
    assert.equal(rejected.status, 1);
    assert.equal(rejected.report, undefined);
  }
});
