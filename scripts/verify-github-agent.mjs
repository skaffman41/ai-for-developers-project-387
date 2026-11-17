import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

assert.ok(process.env.GITHUB_AGENT_ROOT, "GITHUB_AGENT_ROOT is required");
const root = process.env.GITHUB_AGENT_ROOT;
const agent = JSON.parse(await readFile(join(root, "agent.json"), "utf8"));
/** @type {{name: string, location: string, content: string}[]} */
const discovered = JSON.parse(
  await readFile(join(root, "discovery.json"), "utf8"),
);
const lock = JSON.parse(await readFile(join(root, "skills-lock.json"), "utf8"));
const mode = process.env.GITHUB_AGENT_MODE;
assert.ok(mode && ["read-only", "publish", "pr-review"].includes(mode));
const publish = mode === "publish";
assert.equal(
  agent.name,
  mode === "pr-review"
    ? "github-pr-review"
    : publish
      ? "github-publisher"
      : "github-reader",
);
assert.equal(agent.mode, "primary");
assert.deepEqual(agent.model, {
  providerID: "opencode",
  modelID: "glm-5.3-flash-free",
});
/** @param {{name: string, tools: Record<string, boolean>}} candidate @param {string[]} permitted */
function verifyTools(candidate, permitted) {
  for (const [tool, enabled] of Object.entries(candidate.tools)) {
    assert.ok(
      !enabled || permitted.includes(tool),
      `Unexpected enabled tool for ${candidate.name}: ${tool}`,
    );
  }
  for (const tool of permitted) assert.equal(candidate.tools[tool], true, tool);
}
verifyTools(
  agent,
  publish
    ? ["read", "glob", "skill", "edit", "write", "bash", "task"]
    : ["read", "glob", "skill"],
);
if (publish) {
  for (const name of ["review-standards", "review-spec"]) {
    const reviewer = JSON.parse(
      await readFile(join(root, `${name}.json`), "utf8"),
    );
    assert.equal(reviewer.name, name);
    assert.equal(reviewer.mode, "subagent");
    assert.deepEqual(reviewer.model, agent.model);
    verifyTools(reviewer, ["read", "glob", "skill"]);
  }
}
for (const skill of lock.skills) {
  const found = discovered.find((item) => item.name === skill.name);
  assert.ok(found, `Runtime did not discover ${skill.name}`);
  assert.equal(found.location, join(root, "skills", skill.name, "SKILL.md"));
  const source = await readFile(found.location, "utf8");
  assert.ok(
    found.content.length > 0 && source.includes(found.content.trim()),
    skill.name,
  );
}
console.log(
  `Runtime verified: ${process.env.GITHUB_AGENT_MODE} tools; all 38 pinned skills discovered and read`,
);
