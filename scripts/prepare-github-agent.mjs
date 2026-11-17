import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";

/** @type {{source: string, revision: string, verification: {fileCount: number}, skills: {name: string, path: string, gitTreeSha1: string, fileCount: number, folderSha256: string}[]}} */
const lock = JSON.parse(await readFile("skills-lock.json", "utf8"));
assert.equal(lock.source, "https://github.com/mattpocock/skills");
assert.match(lock.revision, /^[a-f0-9]{40}$/);
assert.equal(lock.skills.length, 38);
assert.equal(new Set(lock.skills.map((skill) => skill.name)).size, 38);
assert.ok(process.env.RUNNER_TEMP, "RUNNER_TEMP is required");
assert.ok(process.env.GITHUB_ENV, "GITHUB_ENV is required");

/** @param {string} dir */
async function rejectSymlinks(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    assert.ok(
      !entry.isSymbolicLink(),
      `Symlink in the bootstrap checkout: ${path}`,
    );
    if (entry.name === ".git") continue;
    if (entry.isDirectory()) await rejectSymlinks(path);
  }
}
await rejectSymlinks(process.cwd());
// V1 read permissions are lexical. Keep subsequent adapter PR checkouts from
// materializing a tracked symlink that could traverse into .git or outside cwd.
const symlinkConfig = spawnSync(
  "git",
  ["config", "--local", "core.symlinks", "false"],
  {
    encoding: "utf8",
  },
);
assert.equal(symlinkConfig.status, 0, symlinkConfig.stderr);

const root = await mkdtemp(
  join(resolve(process.env.RUNNER_TEMP), "github-agent-"),
);
const source = join(root, "upstream");
const skills = join(root, "skills");
const state = join(root, "state");
await mkdir(source);
await mkdir(skills);
await mkdir(state);

/** @param {string[]} args */
function git(args) {
  const result = spawnSync("git", args, { cwd: source, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args[0]} failed: ${result.stderr}`);
  return result.stdout.trim();
}
git(["init", "--quiet"]);
git(["remote", "add", "origin", lock.source]);
git(["fetch", "--quiet", "--depth=1", "origin", lock.revision]);
git(["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
assert.equal(git(["rev-parse", "HEAD"]), lock.revision);

/** @param {string} dir @param {string} [prefix] @returns {Promise<string[]>} */
async function files(dir, prefix = "") {
  const paths = [];
  for (const entry of await readdir(join(dir, prefix), {
    withFileTypes: true,
  })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) paths.push(...(await files(dir, path)));
    else {
      assert.ok(entry.isFile(), `Non-regular skill file: ${path}`);
      paths.push(path);
    }
  }
  return paths.sort();
}

let count = 0;
for (const skill of lock.skills) {
  assert.match(skill.name, /^[a-z0-9-]+$/);
  assert.match(skill.path, /^skills\/[a-z0-9-/]+$/);
  assert.equal(
    git(["rev-parse", `HEAD:${skill.path}`]),
    skill.gitTreeSha1,
    skill.name,
  );
  const dir = join(source, skill.path);
  const paths = await files(dir);
  assert.equal(paths.length, skill.fileCount, skill.name);
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path).update("\0");
    hash.update(
      createHash("sha256")
        .update(await readFile(join(dir, path)))
        .digest(),
    );
  }
  assert.equal(hash.digest("hex"), skill.folderSha256, skill.name);
  await cp(dir, join(skills, skill.name), {
    recursive: true,
    errorOnExist: true,
  });
  count += paths.length;
}
assert.equal(count, lock.verification.fileCount);
assert.equal(count, 103);
console.log(
  `Verified ${lock.skills.length} skills, ${count} files at ${lock.revision}`,
);

const model = "opencode/glm-5.3-flash-free";
const permission = {
  "*": "deny",
  read: {
    "*": "allow",
    "*.env": "deny",
    "*.env.*": "deny",
    ".git": "deny",
    ".git/*": "deny",
    "**/.git": "deny",
    "**/.git/*": "deny",
  },
  glob: "allow",
  skill: Object.fromEntries([
    ["*", "deny"],
    ...lock.skills.map((skill) => [skill.name, "allow"]),
  ]),
  external_directory: { "*": "deny", [`${skills}/*`]: "allow" },
};
const config = {
  $schema: "https://opencode.ai/config.json",
  model,
  small_model: model,
  default_agent: "github-reader",
  enabled_providers: ["opencode"],
  provider: { opencode: { whitelist: ["glm-5.3-flash-free"] } },
  autoupdate: false,
  share: "disabled",
  snapshot: false,
  formatter: false,
  lsp: false,
  skills: { paths: [skills] },
  permission,
  agent: {
    "github-reader": {
      mode: "primary",
      model,
      permission,
      description: "Read the project and answer the GitHub comment.",
      prompt:
        "Read AGENTS.md and docs/agents/github-agent.md before answering. Use the pinned skills when relevant. This invocation permits reading and a reply in the current discussion. Report limitations when the requested action needs unavailable tools.",
    },
  },
};
await writeFile(
  join(root, "opencode.json"),
  `${JSON.stringify(config, null, 2)}\n`,
);
await writeFile(join(root, "skills-lock.json"), `${JSON.stringify(lock)}\n`);
await cp("scripts/verify-github-agent.mjs", join(root, "verify.mjs"));
// The official composite action has no version input and caches by latest release.
// Bash sources this guard for its steps; an unexpected cached runtime fails closed.
await writeFile(
  join(root, "guard.sh"),
  `opencode() {
  local executable
  executable="$(type -P opencode)"
  if [[ -z "$executable" || "$("$executable" --version)" != "1.19.6" ]]; then
    echo 'Expected official OpenCode 1.19.6; refusing an unpinned runtime.' >&2
    return 1
  fi
  if [[ "$1" == github && "\${2:-}" == run ]]; then
    if [[ -z "\${OPENCODE_API_KEY:-}" ]]; then
      echo 'OPENCODE_API_KEY Actions Secret is missing; no model was called.' >&2
      return 1
    fi
    env -u OPENCODE_API_KEY "$executable" debug agent github-reader > "$GITHUB_AGENT_ROOT/agent.json" || return
    env -u OPENCODE_API_KEY "$executable" debug skill > "$GITHUB_AGENT_ROOT/discovery.json" || return
    node "$GITHUB_AGENT_ROOT/verify.mjs" || return
    for name in to-spec to-tickets implement-spec; do
      env -u OPENCODE_API_KEY "$executable" debug agent github-reader --tool skill --params "{\\"name\\":\\"$name\\"}" > "$GITHUB_AGENT_ROOT/$name.json" || return
    done
    if [[ -n "$(git status --porcelain --untracked-files=all)" ]]; then
      echo 'Bootstrap dirtied the checkout; refusing adapter finalizer publication.' >&2
      return 1
    fi
  fi
  command "$executable" "$@"
}
`,
);
const environment = {
  GITHUB_AGENT_ROOT: root,
  BASH_ENV: join(root, "guard.sh"),
  OPENCODE_CONFIG: join(root, "opencode.json"),
  OPENCODE_DISABLE_PROJECT_CONFIG: "true",
  OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
  OPENCODE_DISABLE_AUTOUPDATE: "true",
  OPENCODE_TEST_HOME: join(state, "home"),
  XDG_CONFIG_HOME: join(state, "config"),
  XDG_DATA_HOME: join(state, "data"),
  XDG_CACHE_HOME: join(state, "cache"),
  XDG_STATE_HOME: join(state, "state"),
};
await writeFile(
  process.env.GITHUB_ENV,
  `${Object.entries(environment)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`,
  { flag: "a" },
);
console.log(
  "Staged isolated read-only runtime configuration outside the checkout",
);
