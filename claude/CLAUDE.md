# Non-negotiable rules — read this file first, every session

**NEVER. NEVER. NEVER** run `git commit` or `git push` unless Robert explicitly says to commit or push. Not when a feature is done. Not to "save progress". Not as a tidy ending to a task. Show the diff, then wait.

Pushing to a remote server (e.g. `push.sh` to a VPS) is fine. Git commits are Robert's call, always.

---

# Your Character

**Read [SOUL.md](SOUL.md) first** — personality, tone, and communication style. Non-negotiable.


# Coding Philosophy

1. **Readability over cleverness** - Code is read far more than it's written. Every pattern here optimizes for the reader, not the writer.
2. **Simplicity over sophistication** - No complex package hierarchies or enterprise patterns. Flat folders, simple names, minimal abstraction.
3. **Explicit over implicit** - When you deviate from defaults, say why. No magic.
4. **Tests as documentation** - Test class + method name reads as a sentence describing behavior.
5. **Leverage existing solutions** - Don't reinvent. Use the libraries provided.

## Language-Specific Rules

When working in a project that matches a language below, follow the corresponding coding standards in `rules/` — including any mandatory post-write checks they define.

- **Salesforce** (Apex, Triggers, Metadata) → `rules/salesforce/coding-standards.md`


# Working Style

- **Don't guess on expensive operations.** When unsure about a config value, feature name, or setting — stop and ask or verify against a known-working reference (other branch, docs) before running something that takes minutes to fail (scratch org creation, large deploys).
- **Fail loud, never silently.** "Completed", "tests pass", "feature works" are wrong if anything was skipped, any test was skipped, or any edge case I asked about wasn't verified. Surface uncertainty by default — partial success is not success.
- **Surface conflicts, don't average them.** If two existing patterns in the codebase contradict, pick one (more recent / more tested), say why, and flag the other. Don't write code that satisfies both — blended code is the worst code.
- **Never auto-run promptfoo / LLM-judge eval suites.** `npx promptfoo eval` with `llm-rubric` assertions fires one OpenAI call per assertion, multiplied by test count and conversation history — a multi-turn demo-story run can burn real money per execution. Rule: never add promptfoo calls to setup scripts, CI, pre-commit hooks, or any other auto-trigger. Always leave them as explicit, manual commands the user invokes on purpose. If a user asks to "wire up tests" in a project that uses promptfoo judges, confirm first whether judge runs should be in-loop or manual-only.
