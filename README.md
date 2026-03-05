# 🪼 ROBERT.md
#### (rules for any AI that dares to co-work with me)

I've been watching everyone figure out how to talk to their AI coding assistants, and nobody agrees on how much you actually need to say.

[Boris Cherny](https://www.threads.com/@boris_cherny/post/DTBVlMIkpcm), who created Claude Code, says his setup is "surprisingly vanilla" — the model already knows how to code, so he barely customizes it. [Peter Steinberger](https://steipete.me/posts/2026/openclaw) went the other direction with [OpenClaw](https://github.com/openclaw/openclaw): give your agent a `SOUL.md` — a personality, opinions, a voice — because a good assistant shouldn't sound like a corporate chatbot. Meanwhile, every tool is shipping its own flavor: `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `copilot-instructions.md`. Vendor-specific files that are quietly becoming an industry standard.

This repo is me trying to make sense of all of that. One place for the stuff that's *mine* — how I think, how I code, what I expect — version-controlled, symlinked into `~/.claude/`, and portable to whatever tool comes next.

## The layers

The hard part isn't *what* to put in these files — it's *where*. What's mine is different from what's [Aquiva](https://aquivalabs.com)'s, which is different from what a specific project needs.

<pre>┌──────────────────────────────────────────────────────────────┐
│  Me (<a href="https://github.com/rsoesemann/ROBERT.md">ROBERT.md</a>)                                              │
│  How I talk. How I code. What annoys me.                     │
│  <a href="claude/SOUL.md">SOUL.md</a>, <a href="claude/CLAUDE.md">CLAUDE.md</a>, <a href="claude/rules/salesforce/">rules/salesforce/</a>                       │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Aquiva (<a href="https://github.com/AquivaLabs/AQUIVA.md">AQUIVA.md</a>)                                    │  │
│  │  Shared conventions. Company-wide skills & workflows.  │  │
│  │                                                        │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  Project (e.g. <a href="https://github.com/aquivalabs/my-org-butler">my-org-butler</a>)                    │  │  │
│  │  │  Domain model. Features. Project-specific stuff. │  │  │
│  │  │  .claude/CLAUDE.md, .claude/skills/              │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘</pre>

Claude Code [merges all of this](https://code.claude.com/docs/en/best-practices) at session start. Nothing overrides — it all stacks.

## What's in here

### Instructions

**[`claude/SOUL.md`](claude/SOUL.md)** — My personality. Snarky, German, no fluff. So the AI talks like a sharp colleague, not a support bot. Inspired by [Peter Steinberger's OpenClaw](https://github.com/openclaw/openclaw). Referenced from `CLAUDE.md` and symlinked into `~/.claude/`.

**[`claude/CLAUDE.md`](claude/CLAUDE.md)** — My five coding commandments. Points to SOUL.md for tone. Non-negotiable.

**[`claude/rules/salesforce/`](claude/rules/salesforce/)** — My brutal, [PMD-backed](claude/skills/sf-code-analyzer/pmd-ruleset.xml) Apex standards. The machine checks what I forget.

**[`claude/settings.json`](claude/settings.json)** — So Claude stops nagging me for permission before every git push.

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

`~/.claude/skills/` is a real directory, not a symlink. This is intentional — it lets multiple config repos contribute skills to the same place. My personal repo, the [Aquiva company repo](https://github.com/AquivaLabs/AQUIVA.md), and any project can all add skills. Each install script symlinks its individual skill folders in, and they coexist:

```text
~/.claude/skills/
├── sf-code-analyzer/    →  from ROBERT.md (personal)
├── assess-codebase/     →  from AQUIVA.md (company)
├── some-personal-skill/ →  from ROBERT.md only
└── some-company-skill/  →  from AQUIVA.md only
```

When the same skill exists in both, the last `install.sh` to run wins — that's fine when the content is identical. For project-specific overrides, a project's own `.claude/skills/` always takes precedence over `~/.claude/skills/`.
