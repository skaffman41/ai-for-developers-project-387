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

const repository = "skaffman41/ai-for-developers-project-387";
const sha = "a".repeat(40);
const cleanReport = {
  auditReportVersion: 2,
  vulnerabilities: {},
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: 0,
    },
  },
};
const advisoryReport = {
  auditReportVersion: 2,
  vulnerabilities: Object.fromEntries(
    ["moderate", "high", "critical"].map((severity, index) => [
      `dev-tool-${severity}`,
      {
        name: `dev-tool-${severity}`,
        severity,
        isDirect: true,
        range: "<2.0.0",
        nodes: [`node_modules/dev-tool-${severity}`],
        fixAvailable: true,
        via: [
          {
            source: 100 + index,
            name: `dev-tool-${severity}`,
            title: `${severity} fixture advisory`,
            url: `https://github.com/advisories/GHSA-fixture-${severity}`,
            severity,
            range: "<2.0.0",
          },
        ],
      },
    ]),
  ),
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 1,
      high: 1,
      critical: 1,
      total: 3,
    },
  },
};

async function audit(
  options: {
    report?: unknown;
    mode?: string;
    issues?: unknown[];
    secret?: string;
    repeat?: boolean;
    recover?: boolean;
    split?: boolean;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "dependency-audit-test-"));
  try {
    const bin = join(directory, "bin");
    const output = join(directory, "output");
    const runtime = join(directory, "runtime");
    for (const path of [bin, output, runtime]) await mkdir(path);
    if (options.mode !== "missing_preflight")
      await writeFile(
        join(runtime, "audit-ready.json"),
        JSON.stringify({
          mode: "audit",
          runtime: "1.19.6",
          model: "opencode/deepseek-v4.1-flash-free",
        }),
      );
    await writeFile(
      join(directory, "report.json"),
      typeof options.report === "string"
        ? options.report
        : JSON.stringify(options.report ?? cleanReport),
    );
    await writeFile(
      join(directory, "issues.json"),
      JSON.stringify(options.issues ?? []),
    );
    const cli = `#!${process.execPath}
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { basename, join } from 'node:path';
const root = process.env.AUDIT_FIXTURE_ROOT;
const name = basename(process.argv[1]);
const args = process.argv.slice(2);
const mode = process.env.AUDIT_FIXTURE_MODE;
if (name === 'git') { console.log('${sha}'); process.exit(0); }
if (name === 'npm') {
  assert.deepEqual(args, ['audit', '--json', '--package-lock-only', '--workspaces', '--include-workspace-root', '--include=dev']);
  process.stdout.write(readFileSync(join(root, 'report.json')));
  process.exit(mode === 'npm_failure' ? 7 : mode === 'advisories' ? 1 : 0);
}
if (name === 'opencode') {
  if (args[0] === '--version') { console.log(mode === 'wrong_version' ? '2.0.0' : '1.19.6'); process.exit(0); }
  for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'ACTIONS_ID_TOKEN_REQUEST_URL']) assert.equal(process.env[name], undefined);
  const input = readFileSync(0, 'utf8');
  assert.match(input, /advisory/);
  assert.match(input, /audit-report.json/);
  assert.match(input, /issues.json/);
  if (mode === 'model_failure') process.exit(7);
  if (mode === 'model_timeout') { await new Promise(() => setInterval(() => {}, 1000)); }
  const findings = JSON.parse(readFileSync(join(process.env.DEPENDENCY_AUDIT_DIRECTORY, 'findings.json'), 'utf8'));
  const answer = mode === 'invalid_model' ? '{broken' : JSON.stringify({ summary: 'Проверено закреплённое дерево. Автоматическое исправление не выполнялось.', applicability: 'Advisory требует проверки достижимости; дефект календаря не подтверждён.', assessments: findings.filter(f => ['high', 'critical'].includes(f.severity)).map(f => ({ key: f.key, applicability: 'Нужна проверка достижимости.', action: 'Оценить безопасное обновление.', knownIssueNumbers: [] })) });
  console.log(JSON.stringify({ type: 'text', part: { id: 'final', messageID: 'answer', text: answer } }));
  process.exit(0);
}
assert.equal(name, 'gh');
assert.equal(args[0], 'api');
assert.match(args.join(' '), /repos\\/skaffman41\\/ai-for-developers-project-387\\/issues/);
const issues = JSON.parse(readFileSync(join(root, 'issues.json'), 'utf8'));
if (args.includes('--paginate')) { console.log(JSON.stringify([issues.slice(0, 1), issues.slice(1)])); process.exit(0); }
const body = JSON.parse(readFileSync(0, 'utf8'));
appendFileSync(join(root, 'operations.jsonl'), JSON.stringify({ args, body }) + '\\n');
if (mode === 'publish_failure') process.exit(7);
let journal = issues.find(i => i.title === 'Журнал аудита зависимостей' && i.user?.login === 'github-actions[bot]' && i.body?.startsWith('<!-- dependency-audit:journal:v1 -->\\n'));
if (args.includes('POST')) {
  assert.equal(journal, undefined);
  journal = { number: 90, title: 'Журнал аудита зависимостей', user: { login: 'github-actions[bot]', type: 'Bot' }, html_url: 'https://github.com/${repository}/issues/90', state: 'open', body: body.body };
  issues.push(journal);
} else {
  assert.ok(journal);
  journal.body = body.body;
}
writeFileSync(join(root, 'issues.json'), JSON.stringify(issues));
if (mode === 'partial_publication' && args.includes('POST')) process.exit(7);
console.log(JSON.stringify(journal));
`;
    for (const name of ["npm", "git", "opencode", "gh"]) {
      await writeFile(join(bin, name), cli);
      await chmod(join(bin, name), 0o755);
    }
    const run = (phase?: string) =>
      spawnSync(
        process.execPath,
        [
          resolve("scripts/run-dependency-audit.mjs"),
          ...(phase ? [phase] : []),
        ],
        {
          env: {
            ...process.env,
            PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
            GITHUB_REPOSITORY: repository,
            GITHUB_REF: "refs/heads/main",
            GITHUB_EVENT_NAME: "workflow_dispatch",
            GITHUB_SHA: sha,
            GITHUB_RUN_ID: "123",
            GITHUB_RUN_ATTEMPT: "1",
            GITHUB_SERVER_URL: "https://github.com",
            DEPENDENCY_AUDIT_DIRECTORY: output,
            DEPENDENCY_AUDIT_MODEL_TIMEOUT_MS:
              options.mode === "model_timeout" ? "300" : undefined,
            GITHUB_AGENT_ROOT: runtime,
            GITHUB_AGENT_MODE: "audit",
            OPENCODE_API_KEY:
              phase === "publish"
                ? undefined
                : (options.secret ?? "fixture-no-inference"),
            GH_TOKEN: "fixture-only",
            GITHUB_TOKEN: "fixture-only",
            AUDIT_FIXTURE_ROOT: directory,
            AUDIT_FIXTURE_MODE: options.mode ?? "success",
          },
          encoding: "utf8",
          timeout: 5000,
        },
      );
    let result = run(options.split ? "analyze" : undefined);
    if (options.split) result = run("publish");
    const firstStatus = result.status;
    if (options.repeat) {
      const next = run();
      if (!options.recover) assert.equal(next.status, result.status);
      result = next;
    }
    const saved = JSON.parse(
      await readFile(join(output, "result.json"), "utf8").catch((error) => {
        throw new Error(`${result.stderr}\n${error}`);
      }),
    );
    const operations = (
      await readFile(join(directory, "operations.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const raw = await readFile(join(output, "audit-report.json"), "utf8");
    return { ...result, saved, operations, raw, firstStatus };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("A clean pinned dependency tree produces one substantive permanent journal and preserved source bytes", async () => {
  const result = await audit();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.saved.status, "clean");
  assert.equal(result.raw, JSON.stringify(cleanReport));
  assert.equal(result.operations.length, 1);
  const body = result.operations[0].body.body;
  assert.match(body, /Проверено закреплённое дерево/);
  assert.match(body, /Advisory требует проверки/);
  assert.match(body, new RegExp(sha));
  assert.match(body, /actions\/runs\/123/);
  assert.match(body, /reportSha256/);
  assert.equal(result.saved.provenance.dataType, "real");
});

test("Expected audit exit 1 keeps all severities and dev advisories while journaling new high/critical candidates", async () => {
  const result = await audit({ report: advisoryReport, mode: "advisories" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.saved.status, "new-candidates");
  assert.equal(result.saved.findings.length, 3);
  assert.deepEqual(
    result.saved.findings
      .map((item: { severity: string }) => item.severity)
      .sort(),
    ["critical", "high", "moderate"],
  );
  assert.equal(result.raw, JSON.stringify(advisoryReport));
  assert.match(result.operations[0].body.body, /Оценить безопасное обновление/);
  assert.match(
    result.operations[0].body.body,
    /не подтверждает дефект календаря/,
  );
  assert.equal(result.operations.length, 1);
});

test("Low/moderate reports are distinct from clean and known open/closed high advisories link to Issues across pages while PRs do not count", async () => {
  const moderate = structuredClone(advisoryReport);
  delete moderate.vulnerabilities["dev-tool-high"];
  delete moderate.vulnerabilities["dev-tool-critical"];
  moderate.metadata.vulnerabilities = {
    info: 0,
    low: 0,
    moderate: 1,
    high: 0,
    critical: 0,
    total: 1,
  };
  assert.equal(
    (await audit({ report: moderate, mode: "advisories" })).saved.status,
    "below-threshold",
  );
  const result = await audit({
    report: advisoryReport,
    mode: "advisories",
    issues: [
      {
        number: 4,
        state: "open",
        title: "dev-tool-high",
        body: "Advisory npm:101",
        html_url: `https://github.com/${repository}/issues/4`,
      },
      {
        number: 5,
        state: "closed",
        title: "dev-tool-critical",
        body: "Advisory npm:102",
        html_url: `https://github.com/${repository}/issues/5`,
      },
      {
        number: 6,
        title: "dev-tool-moderate",
        body: "Advisory npm:100",
        pull_request: {},
        html_url: `https://github.com/${repository}/pull/6`,
      },
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.saved.status, "known-high-critical");
  assert.match(result.operations[0].body.body, /issues\/4/);
  assert.match(result.operations[0].body.body, /issues\/5/);
  assert.doesNotMatch(result.operations[0].body.body, /pull\/6/);
});

test("A repeat updates the same journal body without creating another Issue or comments, including a previously closed journal", async () => {
  const result = await audit({ repeat: true });
  assert.equal(result.operations.length, 1);
  const existing = await audit({
    issues: [
      {
        number: 90,
        title: "Журнал аудита зависимостей",
        user: { login: "github-actions[bot]", type: "Bot" },
        state: "closed",
        body: "<!-- dependency-audit:journal:v1 -->\nOld result",
      },
    ],
  });
  assert.equal(existing.operations.length, 1);
  assert.ok(existing.operations[0].args.includes("PATCH"));
  assert.match(existing.operations[0].args.join(" "), /issues\/90/);
  assert.deepEqual(Object.keys(existing.operations[0].body), ["body"]);
});

test("Separate analysis and publication work without the model secret in the publisher", async () => {
  const result = await audit({ split: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.saved.status, "clean");
  assert.equal(result.operations.length, 1);
});

test("An advisory retains its own severity when a package has both high and moderate advisories", async () => {
  const report = {
    auditReportVersion: 2,
    vulnerabilities: {
      mixed: {
        ...advisoryReport.vulnerabilities["dev-tool-high"],
        via: [
          ...advisoryReport.vulnerabilities["dev-tool-high"].via,
          ...advisoryReport.vulnerabilities["dev-tool-moderate"].via,
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
  };
  const result = await audit({ report, mode: "advisories" });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.saved.findings
      .map((finding: { severity: string }) => finding.severity)
      .sort(),
    ["high", "moderate"],
  );
});

test("A longer advisory identifier in an existing Issue does not hide a new candidate", async () => {
  const report = {
    auditReportVersion: 2,
    vulnerabilities: {
      "dev-tool-high": advisoryReport.vulnerabilities["dev-tool-high"],
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
  };
  const result = await audit({
    report,
    mode: "advisories",
    issues: [
      {
        number: 7,
        title: "dev-tool-high",
        body: "Different advisory npm:1010",
        state: "open",
      },
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.saved.status, "new-candidates");
});

test("Prose punctuation and a package version still identify an existing advisory Issue", async () => {
  const report = {
    auditReportVersion: 2,
    vulnerabilities: {
      "dev-tool-high": advisoryReport.vulnerabilities["dev-tool-high"],
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
  };
  const result = await audit({
    report,
    mode: "advisories",
    issues: [
      {
        number: 7,
        title: "dev-tool-high@1.0.0: advisory",
        body: "Affected package dev-tool-high: advisory npm:101.",
        state: "closed",
      },
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.saved.status, "known-high-critical");
});

test("A quoted journal marker in an ordinary Issue cannot become a publication target", async () => {
  const result = await audit({
    issues: [
      {
        number: 12,
        title: "Discussion of the journal",
        body: "Example: <!-- dependency-audit:journal:v1 -->",
        user: { login: "skaffman41", type: "User" },
      },
    ],
  });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.operations[0].args.includes("POST"));
});

test("A partially successful journal creation is recovered without a duplicate", async () => {
  const result = await audit({
    mode: "partial_publication",
    repeat: true,
    recover: true,
  });
  assert.equal(result.firstStatus, 1);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.saved.status, "clean");
  assert.equal(result.operations.length, 1);
});

test("The permanent journal keeps known-task links beyond the first ten assessments", async () => {
  const vulnerabilities = Object.fromEntries(
    Array.from({ length: 11 }, (_, index) => [
      `tool-${index}`,
      {
        ...advisoryReport.vulnerabilities["dev-tool-high"],
        via: [
          {
            source: 1000 + index,
            title: `fixture ${index}`,
            url: `https://github.com/advisories/fixture-${index}`,
            severity: "high",
          },
        ],
      },
    ]),
  );
  const issues = Array.from({ length: 11 }, (_, index) => ({
    number: index + 1,
    title: `tool-${index}`,
    body: `npm:${1000 + index}`,
    state: "open",
  }));
  const result = await audit({
    report: {
      auditReportVersion: 2,
      vulnerabilities,
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: 11,
          critical: 0,
          total: 11,
        },
      },
    },
    mode: "advisories",
    issues,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.operations[0].body.body, /issues\/11/);
});

test("The service journal never becomes a known finding task on the next audit", async () => {
  const result = await audit({
    report: advisoryReport,
    mode: "advisories",
    repeat: true,
  });
  assert.equal(result.saved.status, "new-candidates");
  assert.equal(result.operations.length, 1);
});

test("Missing/invalid reports, model configuration/errors/timeouts and publication refusals never become a clean audit", async () => {
  for (const [mode, report, secret, expected] of [
    ["success", "{broken", undefined, "report-error"],
    ["npm_failure", cleanReport, undefined, "report-error"],
    ["success", cleanReport, "", "model-error"],
    ["invalid_model", cleanReport, undefined, "model-error"],
    ["model_failure", cleanReport, undefined, "model-error"],
    ["model_timeout", cleanReport, undefined, "model-timeout"],
    ["wrong_version", cleanReport, undefined, "model-error"],
    ["missing_preflight", cleanReport, undefined, "model-error"],
    ["publish_failure", cleanReport, undefined, "publication-error"],
  ] as const) {
    const result = await audit({ mode, report, secret });
    assert.equal(result.status, 1, mode);
    assert.equal(result.saved.status, expected, mode);
    assert.ok(result.saved.error);
    if (expected !== "publication-error")
      assert.match(result.operations[0].body.body, /не завершён/);
  }
});
