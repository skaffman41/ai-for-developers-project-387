# Workflows

The [opencode.yml](opencode.yml) workflow handles new owner `/oc` and `/opencode`
comments on Issues and PRs. Authorization runs before checkout or model secrets;
the queued job repeats authorization and checks the shared 3-attempt manual PR
budget, including each Re-run attempt. Successful admission steps in Actions
history are the budget source. `queue: max` preserves queued commands without
cancelling the active job. The job token and separately verified App cannot write
Actions history. Bootstrap comes from the default branch, not the PR.

The [opencode-pr-review.yml](opencode-pr-review.yml) workflow reviews trusted open
PRs on `opened`, `synchronize`, and `reopened`, including our OpenCode App's PRs.
Forks and other authors are rejected before checkout or model secrets;
`pull_request_target` is not used. A separate ordinary CLI session reads the exact
head as data with only read/glob/skill. Trusted code and REVIEW.md come from main.
A no-model publisher validates the result and comments with its SHA; it never
approves the PR. Per-PR concurrency cancels obsolete reviews, and Actions history
prevents another model review of the same head, including Re-run. Automatic review
does not spend the manual budget or start a correction loop.

The review step supervises the trusted main helper and reports progress every
30 seconds: elapsed time, event/stderr byte counts, the last event type, and a
whitelisted provider error class/HTTP status when available. These counters show
observed CLI output; a completed review requires a validated result and its
publisher. The CLI limit remains 28 minutes inside the 30-minute job. On success
or failure, `pr-review-diagnostics-<run_id>-<run_attempt>` retains only
`review-diagnostics.json` for 14 days. Prompts, raw events, stderr and environment
values are excluded. Cancellation may prevent this diagnostic upload.

`--format json` serializes CLI events; the assistant answer may still be ordinary
text. The result envelope contains exactly one of a validated structured `review`
or bounded `text`. Text is published verbatim with the checked SHA, without
inventing a structured findings count. CLI/provider failures and malformed JSON
reviews remain failures. The producer bounds UTF-8 bytes before artifact upload.

Its separate 15-minute browser job has no model secret: it checks out and verifies
the exact PR head, then saves an HTML report, expected/actual SHA, traces and
screenshots on success and failure. `pr-browser-<run_id>-<run_attempt>` artifacts
are retained for 14 days. Setup failures retain a step report; browser diagnostics
exist only after a test starts. Cancellation may prevent artifact upload.

The independent [opencode-report.yml](opencode-report.yml) and
[opencode-pr-review-report.yml](opencode-pr-review-report.yml) workflows run after
the producer stops, with their own 5-minute timeout, no model and no PR checkout.
They explain `timeout`, `agent_failed`, or `infra` with the last known SHA, run
link and “нужен человек”; the manual reporter also explains `limit_exhausted`.
See the [agent guide](../../docs/agents/github-agent.md) for permissions and the
[README](../../README.md#автоматическое-ревью-pr-и-бюджет-запусков) for user behavior.
Local checks do not prove live Actions acceptance: the new bootstrap needs a
separately authorized merge to main and a fresh event.

The [opencode-triage.yml](opencode-triage.yml) workflow handles owner-created `issues: opened` with a fixed `prompt`, a 30-minute timeout, and the same authorized answer queue as manual commands. Prepared `type:*` records skip the model before checkout or secrets. See [README](../../README.md#автотриаж-новых-обращений) for filters and read-only behavior.

After completing all the steps in the project, automatic tests will become available to you. Tests are run on each commit - once all tasks in the Hexlet interface are completed, make a commit, and the tests will run automatically.

The hexlet-check.yml file is responsible for running these tests - do not delete this file, edit it, or rename the repository.

The app-check.yml workflow runs `mise run check` on push, pull request, and explicit Release PR dispatch. Release dispatch verifies its expected head SHA before checkout and again after check. The agent workflow acceptance evidence is recorded in [workflow-verification.md](../../docs/agents/workflow-verification.md).

The release-please.yml workflow maintains one Release PR on main and creates its tag/GitHub Release after manual merge. It uses GITHUB_TOKEN and explicitly dispatches app-check for each created or updated PR. Configuration, permissions, local dry-run, and the separately authorized publication procedure are documented in [releasing.md](../../docs/releasing.md).
