# 🪼 ROBERT.md
#### (rules for any AI that dares to co-work with me)

I've been watching everyone figure out how to talk to their AI coding assistants, and nobody agrees on how much you actually need to say.

[Boris Cherny](https://www.threads.com/@boris_cherny/post/DTBVlMIkpcm), who created Claude Code, says his setup is "surprisingly vanilla" — the model already knows how to code, so he barely customizes it. [Peter Steinberger](https://steipete.me/posts/2026/openclaw) went the other direction with [OpenClaw](https://github.com/openclaw/openclaw): give your agent a `SOUL.md` — a personality, opinions, a voice — because a good assistant shouldn't sound like a corporate chatbot. Meanwhile, every tool is shipping its own flavor: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `copilot-instructions.md`. Vendor-specific files that are quietly becoming an industry standard.

This repo is me trying to make sense of all of that. One place for the stuff that's *mine* — how I think, how I code, what I expect — version-controlled, symlinked into `~/.claude/`, and portable to whatever tool comes next.

## The layers

The hard part isn't *what* to put in these files — it's *where*. What's mine personally is different from what a specific project needs.

<pre>┌──────────────────────────────────────────────────────────────┐
│  Me (<a href="https://github.com/rsoesemann/ROBERT.md">ROBERT.md</a>)                                              │
│  How I talk. How I code. What annoys me.                     │
│  <a href="claude/SOUL.md">SOUL.md</a>, <a href="claude/CLAUDE.md">CLAUDE.md</a>, <a href="claude/rules/salesforce/">rules/salesforce/</a>                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Project (CLAUDE.md in your repo)                      │  │
│  │  Domain model. Features. Project-specific stuff.       │  │
│  │  .claude/CLAUDE.md, .claude/skills/                    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘</pre>

Claude Code [merges all of this](https://code.claude.com/docs/en/best-practices) at session start. Nothing overrides — it all stacks.

## What's in here

### Instructions

**[`claude/SOUL.md`](claude/SOUL.md)** — My personality. Snarky, German, no fluff. So the AI talks like a sharp colleague, not a support bot. Inspired by [Peter Steinberger's OpenClaw](https://github.com/openclaw/openclaw). Referenced from `CLAUDE.md` and symlinked into `~/.claude/`.

**[`claude/CLAUDE.md`](claude/CLAUDE.md)** — My five coding commandments. Points to SOUL.md for tone. Non-negotiable. Three of the Working Style bullets ("fail loud", "surface conflicts", "match the codebase's surface style, not its quality") were sharpened after digging through [Andrej Karpathy's January 2026 thread](https://x.com/karpathy/status/2015883857489522876) on Claude's coding pitfalls — most of his observations were already covered here or by Claude Code itself, but those three earned their place. The last one is a brownfield-aware twist: match the repo's style, but don't inherit its bad habits.

**[`claude/rules/salesforce/`](claude/rules/salesforce/)** — My brutal, [PMD-backed](claude/skills/sf-code-analyzer/pmd-ruleset.xml) Apex standards. The machine checks what I forget.

**[`claude/settings.json`](claude/settings.json)** — So Claude stops nagging me for permission before every git push. Also carries a `UserPromptSubmit` hook that re-injects SOUL.md with every prompt — the voice rules decay over a long session, this keeps them fresh.

### Opting a project out of SOUL

Some projects don't want the voice rules — a spec-interview skill like Speccy needs Claude to ask questions, which SOUL actively discourages. Two files in the project switch it off:

- **`.claude/.no-soul`** — an empty marker file. The hook in `settings.json` checks for it and skips the SOUL injection in that project.
- **`.claude/settings.local.json`** with `{"claudeMdExcludes": ["**/SOUL.md"]}` — stops the `@SOUL.md` import from `CLAUDE.md` loading there.

Everything else (the git-commit rules, coding standards) still applies. Delete the marker to switch SOUL back on.

### Skills

Reusable capabilities that Claude can trigger automatically or I can invoke with `/skillname`. Lives in [`claude/skills/`](claude/skills/).

**[`sf-code-analyzer`](claude/skills/sf-code-analyzer/)** — Runs Salesforce Code Analyzer after code changes. Smart enough to detect managed packages (via `sfdx-project.json`) and only run AppExchange security rules when they matter. Otherwise just my opinionated clean code rules.

## How I use it

I run [`install.sh`](install.sh) once. It symlinks everything into `~/.claude/`, where Claude Code picks it up at session start.

```bash
./install.sh
```

```text
~/.claude/CLAUDE.md                   →  this repo/claude/CLAUDE.md
~/.claude/SOUL.md                     →  this repo/claude/SOUL.md
~/.claude/settings.json               →  this repo/claude/settings.json
~/.claude/rules/                      →  this repo/claude/rules/
~/.claude/skills/sf-code-analyzer/    →  this repo/claude/skills/sf-code-analyzer/
```

After I pull changes, the next session gets them automatically — symlinks always point to the latest version.

### Multiple repos, one skills directory

`~/.claude/skills/` is a real directory, not a symlink. This is intentional — it lets multiple config repos contribute skills to the same place. Each install script symlinks its individual skill folders in, and they coexist. For project-specific overrides, a project's own `.claude/skills/` always takes precedence over `~/.claude/skills/`.
