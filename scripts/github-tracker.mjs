import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { lstat, readFile, realpath, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repository = "skaffman41/ai-for-developers-project-387";
const prefix = `repos/${repository}`;

/** @param {unknown} value */
function object(value) {
  assert.ok(
    value && typeof value === "object" && !Array.isArray(value),
    "Expected an object",
  );
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {Record<string, unknown>} value @param {string[]} names */
function fields(value, names) {
  assert.ok(
    Object.keys(value).every((name) => names.includes(name)),
    "Unsupported request field",
  );
}

/** @param {unknown} value */
function number(value) {
  assert.ok(
    typeof value === "number" && Number.isSafeInteger(value) && value > 0,
    "Expected a positive issue number or ID",
  );
  return value;
}

/** @param {unknown} value @param {boolean} [empty] */
function string(value, empty = false) {
  assert.ok(
    typeof value === "string" && (empty || value.trim().length > 0),
    "Expected text",
  );
  return value;
}

/** @param {unknown} value */
function strings(value) {
  assert.ok(Array.isArray(value), "Expected an array of names");
  return value.map((item) => string(item));
}

/** Convert a public tracker operation to a fixed GitHub endpoint and method.
 * @param {unknown} input
 * @returns {{endpoint: string, method: string, paginate?: boolean, absentAllowed?: boolean, body?: Record<string, unknown>}}
 */
export function trackerRequest(input) {
  const request = object(input);
  fields(request, ["operation", "number", "data"]);
  const operation = string(request.operation);
  const data = object(request.data ?? {});
  const issue = () => `${prefix}/issues/${number(request.number)}`;
  const get = (endpoint = issue(), paginate = false) => ({
    endpoint,
    method: "GET",
    paginate,
  });
  switch (operation) {
    case "repo":
      fields(data, []);
      return get(prefix);
    case "list": {
      fields(data, ["state"]);
      const state = data.state ?? "all";
      assert.ok(
        ["open", "closed", "all"].includes(string(state)),
        "Unsupported issue state",
      );
      return get(`${prefix}/issues?state=${state}&per_page=100`, true);
    }
    case "labels":
      fields(data, []);
      return get(`${prefix}/labels?per_page=100`, true);
    case "view":
      fields(data, []);
      return get();
    case "comments":
    case "children":
    case "blockers": {
      fields(data, []);
      const suffix = {
        comments: "comments",
        children: "sub_issues",
        blockers: "dependencies/blocked_by",
      }[operation];
      return get(`${issue()}/${suffix}?per_page=100`, true);
    }
    case "parent":
      fields(data, []);
      return { ...get(`${issue()}/parent`), absentAllowed: true };
    case "create":
    case "update": {
      fields(
        data,
        operation === "create"
          ? ["title", "body", "labels", "assignees"]
          : ["title", "body", "labels", "assignees", "state", "state_reason"],
      );
      assert.ok(Object.keys(data).length > 0, "Expected issue fields");
      if (operation === "create" || "title" in data) string(data.title);
      if ("body" in data) string(data.body, true);
      if ("labels" in data) strings(data.labels);
      if ("assignees" in data) strings(data.assignees);
      if ("state" in data)
        assert.ok(
          ["open", "closed"].includes(string(data.state)),
          "Unsupported issue state",
        );
      if ("state_reason" in data)
        assert.ok(
          ["completed", "not_planned", "reopened"].includes(
            string(data.state_reason),
          ),
          "Unsupported completion reason",
        );
      return {
        endpoint: operation === "create" ? `${prefix}/issues` : issue(),
        method: operation === "create" ? "POST" : "PATCH",
        body: data,
      };
    }
    case "comment":
      fields(data, ["body"]);
      string(data.body);
      return { endpoint: `${issue()}/comments`, method: "POST", body: data };
    case "link_child":
      fields(data, ["sub_issue_id"]);
      number(data.sub_issue_id);
      return { endpoint: `${issue()}/sub_issues`, method: "POST", body: data };
    case "add_blocker":
      fields(data, ["issue_id"]);
      number(data.issue_id);
      return {
        endpoint: `${issue()}/dependencies/blocked_by`,
        method: "POST",
        body: data,
      };
    default:
      throw new Error("Unsupported tracker operation");
  }
}

/** Read only a new request document in the checkout's dedicated directory.
 * @param {string} path
 */
export async function requestDocument(path) {
  const checkout = await realpath(process.cwd());
  const directory = join(checkout, ".github-agent-requests");
  const file = resolve(checkout, path);
  assert.equal(
    dirname(file),
    directory,
    "Use .github-agent-requests/<name>.json",
  );
  assert.match(basename(file), /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.json$/);
  assert.equal(
    await realpath(directory),
    directory,
    "Request directory must not be a symlink",
  );
  const info = await lstat(file);
  assert.ok(
    info.isFile() && !info.isSymbolicLink(),
    "Expected a regular request document",
  );
  assert.ok(info.size <= 1_048_576, "Request document is too large");
  return { file, request: JSON.parse(await readFile(file, "utf8")) };
}

async function main() {
  assert.equal(process.argv.length, 3, "Pass one request document");
  const { file, request } = await requestDocument(process.argv[2]);
  const operation = trackerRequest(request);
  const args = [
    "api",
    "--hostname",
    "github.com",
    operation.endpoint,
    "--method",
    operation.method,
  ];
  if (operation.paginate) args.push("--paginate", "--slurp");
  if (operation.body) args.push("--input", "-");
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    input: operation.body ? JSON.stringify(operation.body) : undefined,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
  });
  if (result.status !== 0) {
    if (operation.absentAllowed && result.stderr.includes("HTTP 404")) {
      await unlink(file);
      console.log("null");
      return;
    }
    throw new Error(
      `GitHub tracker request failed (exit ${result.status}); check authentication and the requested issue`,
    );
  }
  const data = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  await unlink(file);
  console.log(JSON.stringify(operation.paginate ? data.flat() : data));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Tracker request failed",
    );
    process.exitCode = 1;
  });
}
