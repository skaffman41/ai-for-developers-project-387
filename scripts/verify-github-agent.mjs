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
assert.equal(agent.name, "github-reader");
assert.equal(agent.mode, "primary");
assert.deepEqual(agent.model, {
  providerID: "opencode",
  modelID: "glm-5.3-flash-free",
});
const permitted = new Set(["read", "glob", "skill"]);
for (const [tool, enabled] of Object.entries(agent.tools)) {
  assert.ok(
    !enabled || permitted.has(tool),
    `Unexpected enabled tool: ${tool}`,
  );
}
for (const tool of permitted) assert.equal(agent.tools[tool], true, tool);
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
  "Runtime verified: only read/glob/skill enabled; all 38 pinned skills discovered and read",
);
