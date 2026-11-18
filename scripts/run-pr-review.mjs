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
const textEvents = events.filter(
  (event) =>
    event.type === "text" &&
    typeof event.part?.text === "string" &&
    event.part.text.trim(),
);
const lastText = textEvents.at(-1);
assert.ok(lastText, "Model returned no review");
const messageID = lastText.part.messageID;
const parts = new Map();
for (const event of textEvents) {
  if (
    typeof messageID === "string"
      ? event.part.messageID !== messageID
      : event !== lastText
  )
    continue;
  parts.set(
    typeof event.part.id === "string" ? event.part.id : Symbol(),
    event.part.text,
  );
}
const response = Array.from(parts.values()).join("\n\n");
const text = response.trim();
assert.ok(text, "Model returned an empty review");
// --format json describes CLI events, not the assistant's text inside them.
// Keep prose as prose; do not fabricate an empty structured findings array.
const fence = /^```(json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
const candidate = fence?.[2] ?? text;
const opensJSONFence =
  /^```json[ \t]*(?:\r?\n|$)/i.test(text) || /^```[ \t]*\r?\n\s*\{/.test(text);
let structured = true;
let decoded;
try {
  decoded = JSON.parse(candidate);
} catch {
  assert.ok(
    !opensJSONFence && !candidate.trimStart().startsWith("{"),
    "Malformed JSON review",
  );
  structured = false;
}
let resultBody;
if (!structured) {
  assert.ok(text.length <= 50_000, "Review text too large");
  resultBody = { sha, text };
} else {
  assert.ok(
    decoded && typeof decoded === "object" && !Array.isArray(decoded),
    "Invalid review object",
  );
  /** @param {unknown} value */
  const boundedText = (value) =>
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 5000;
  assert.ok(boundedText(decoded.summary), "Missing review summary");
  assert.ok(Array.isArray(decoded.findings), "Missing findings array");
  assert.ok(decoded.findings.length <= 50, "Too many findings");
  const findings = [];
  for (const finding of decoded.findings) {
    assert.ok(
      boundedText(finding.file) &&
        !finding.file.startsWith("/") &&
        !finding.file.split("/").includes(".."),
      "Finding needs a repository file",
    );
    assert.ok(
      Number.isSafeInteger(finding.line) && finding.line > 0,
      "Finding needs a line",
    );
    assert.ok(
      boundedText(finding.conditions) && boundedText(finding.consequences),
      "Finding needs conditions and consequences",
    );
    findings.push({
      file: finding.file,
      line: finding.line,
      conditions: finding.conditions,
      consequences: finding.consequences,
    });
  }
  resultBody = { sha, review: { summary: decoded.summary, findings } };
}
const serialized = JSON.stringify(resultBody);
assert.ok(
  Buffer.byteLength(serialized, "utf8") < 55_000,
  "Review result too large",
);
await writeFile(join(root, "review.json"), serialized);
console.log(
  `Read-only review produced a result for ${sha}; publication is a separate job`,
);
