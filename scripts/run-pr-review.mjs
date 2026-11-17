import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.env.GITHUB_AGENT_ROOT;
const directory = process.env.GITHUB_REVIEW_DIRECTORY;
const sha = process.env.REVIEW_SHA;
assert.equal(
  process.env.GITHUB_RUN_ATTEMPT,
  "1",
  "Duplicate review attempt refused",
);
assert.ok(root && directory && sha, "Missing authorized review context");
assert.ok(
  process.env.OPENCODE_API_KEY,
  "OPENCODE_API_KEY is required; no fallback",
);
const version = spawnSync("opencode", ["--version"], { encoding: "utf8" });
assert.equal(version.status, 0, "Pinned runtime unavailable");
assert.equal(version.stdout.trim(), "1.19.6", "Unpinned runtime");
// The model process receives no GitHub credential or publisher capability.
const environment = { ...process.env };
delete environment.GH_TOKEN;
delete environment.GITHUB_TOKEN;
delete environment.ACTIONS_RUNTIME_TOKEN;
delete environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
delete environment.ACTIONS_ID_TOKEN_REQUEST_URL;
// CLI 1.19.6 can exit before flushing a large piped stdout. A regular file
// preserves complete event JSON, just like the debug preflight in the workflow.
const eventsPath = join(root, "events.jsonl");
const output = openSync(eventsPath, "w");
const errors = openSync(join(root, "model.stderr"), "w");
let result;
try {
  result = spawnSync(
    "opencode",
    [
      "run",
      "--agent",
      "github-pr-review",
      "--model",
      "opencode/glm-5.3-flash-free",
      "--format",
      "json",
    ],
    {
      cwd: directory,
      env: environment,
      input: await readFile(join(root, "prompt.txt"), "utf8"),
      encoding: "utf8",
      stdio: ["pipe", output, errors],
      timeout: 28 * 60 * 1000,
    },
  );
} finally {
  closeSync(output);
  closeSync(errors);
}
if (
  result.error &&
  "code" in result.error &&
  result.error.code === "ETIMEDOUT"
) {
  assert.ok(process.env.GITHUB_OUTPUT);
  await appendFile(process.env.GITHUB_OUTPUT, "timed_out=true\n");
}
assert.equal(
  result.status,
  0,
  "Read-only review failed; see the no-model reporter",
);
const events = (await readFile(eventsPath, "utf8"))
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
assert.ok(
  !events.some((event) => event.type === "error"),
  "Model reported an error",
);
const response = events
  .filter((event) => event.type === "text" && event.part?.text?.trim())
  .at(-1)?.part.text;
assert.ok(typeof response === "string", "Model returned no review");
const review = JSON.parse(response);
assert.ok(
  typeof review.summary === "string" && review.summary.trim(),
  "Missing review summary",
);
assert.ok(Array.isArray(review.findings), "Missing findings array");
assert.ok(review.findings.length <= 50, "Too many findings");
for (const finding of review.findings) {
  assert.ok(
    typeof finding.file === "string" &&
      finding.file.trim() &&
      !finding.file.startsWith("/") &&
      !finding.file.split("/").includes(".."),
    "Finding needs a repository file",
  );
  assert.ok(
    Number.isSafeInteger(finding.line) && finding.line > 0,
    "Finding needs a line",
  );
  for (const value of [finding.conditions, finding.consequences]) {
    assert.ok(
      typeof value === "string" && value.trim(),
      "Finding needs conditions and consequences",
    );
  }
}
assert.ok(
  JSON.stringify({ sha, review }).length < 55_000,
  "Review result too large",
);
await writeFile(join(root, "review.json"), JSON.stringify({ sha, review }));
console.log(
  `Read-only review produced a result for ${sha}; publication is a separate job`,
);
