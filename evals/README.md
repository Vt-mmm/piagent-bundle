# Evals (phase 2.6)

- `ab/`: six small offline bug-fix tasks (synthetic fixtures, a red `## Checks` command each) run on arm A
  (`piagent studio`, installed Piagent) and arm B (this repo's bundle: Pi 1.3.0 + harness, sandbox, provider).
  `run.mjs` runs one task on one arm and judges it independently (Checks green, no protected file changed, nothing
  written outside the project); `batch.mjs` runs all pairs; `rescore.mjs` recomputes event-derived fields;
  `stats.mjs` prints the paired comparison. `results/` holds the 2026-10-29 numbers.
- `soak/`: starts the long-task soak lane (piagent repo, `evals/long-task-soak-v1`) on either arm.
  `lane-cmd-arm.patch` is the one change the lane's terminal surface needs.

Both arms use the broker of the local Agent Watch through a copy of its binding (read only), a private agent dir,
and a scrubbed environment. They make real model calls, so run them sparingly.
