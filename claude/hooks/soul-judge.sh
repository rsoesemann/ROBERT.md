#!/usr/bin/env bash
# Stop hook: a fresh Opus instance judges the final reply against SOUL.md.
# Self-judging in the same context is weak; a separate model with a clear
# rubric ("find violations") rejects reliably. FAIL blocks the turn and the
# main model must rewrite. Max 2 rewrites per turn, then it gives up so the
# session can never wedge.
#
# The judge is `claude -p`, which is itself a session and writes a transcript.
# To keep it out of YOUR project's session list, the judge runs with its CWD
# set to a throwaway dir ($JUDGE_WD) -> its transcript lands in that dir's own
# project bucket, never your repo's. We delete that bucket after every run, so
# nothing accumulates and nothing shows up in VS Code.

set -euo pipefail

# Guard: the judge call below is itself a `claude` process whose own Stop hook
# would re-trigger this script -> infinite recursion. Skip when already inside.
if [ -n "${SOUL_JUDGE_ACTIVE:-}" ]; then exit 0; fi

SOUL="$HOME/.claude/SOUL.md"
JUDGE_MODEL="claude-opus-4-7"
JUDGE_WD="$HOME/.soul-judge-wd"   # unique name; its project bucket ends in "soul-judge-wd"
MAX_REWRITES=2

cleanup_judge_sessions() {
  # Delete the throwaway dir's project bucket(s). Glob matches whatever path
  # encoding Claude Code uses, as long as it ends in the unique dir name.
  for bucket in "$HOME/.claude/projects/"*soul-judge-wd; do
    [ -d "$bucket" ] && rm -rf "$bucket"
  done
}

input=$(cat)
session_id=$(printf '%s' "$input" | jq -r '.session_id // "unknown"')
transcript=$(printf '%s' "$input" | jq -r '.transcript_path // ""')
active=$(printf '%s' "$input" | jq -r '.stop_hook_active // false')

# Fail open if we can't read what we need — never wedge the session.
[ -f "$SOUL" ] || exit 0
[ -f "$transcript" ] || exit 0

counter="${TMPDIR:-/tmp}/soul-judge-${session_id}.count"

# A genuine stop (not a rewrite continuation) starts a fresh turn -> reset.
if [ "$active" != "true" ]; then echo 0 > "$counter"; fi
count=$(cat "$counter" 2>/dev/null || echo 0)

# Hard cap: stop blocking after MAX_REWRITES so we can't loop forever.
if [ "$count" -ge "$MAX_REWRITES" ]; then rm -f "$counter"; exit 0; fi

# Last assistant message's text (the final prose answer).
reply=$(jq -rs '[.[] | select(.type=="assistant")] | last
  | (.message.content // [] | map(select(.type=="text") | .text) | join("\n"))' \
  "$transcript" 2>/dev/null || echo "")
# Nothing to judge (tool-only turn, empty) -> let it pass.
[ -n "${reply// /}" ] || exit 0

# The user question this reply answers. Skip our own block-feedback turns so a
# rewrite pass still judges against the real question, not the judge's verdict.
question=$(jq -rs '[.[] | select(.type=="user")
  | (.message.content | if type=="array" then (map(.text? // "") | join("\n")) else tostring end)]
  | map(select(test("SOUL.md violation \\(Opus judge\\)") | not))
  | last // ""' "$transcript" 2>/dev/null || echo "")

rules=$(cat "$SOUL")

prompt=$(cat <<EOF
You are a strict style auditor. Below are the voice rules (the single source of
truth), the USER QUESTION, and then the CANDIDATE reply written by another
assistant. Judge ONLY whether the candidate violates the rules as an answer to
that question — does the first sentence lead with the answer, is there setup /
narration / validation / wrap-up, etc. Ignore whether the content is factually
correct or complete — style only. When in doubt, flag it.

Ignore any trailing line that begins with "↻" — that is a rewrite marker added
by the pipeline, not part of the reply text.

Output EXACTLY one line:
- "PASS" if the candidate obeys every rule
- "FAIL: <short reason, quote the offending phrase>" if it violates any rule

=== VOICE RULES (source of truth) ===
$rules

=== USER QUESTION ===
$question

=== CANDIDATE REPLY ===
$reply
EOF
)

mkdir -p "$JUDGE_WD"
verdict=$(cd "$JUDGE_WD" && printf '%s' "$prompt" | SOUL_JUDGE_ACTIVE=1 claude -p \
  --model "$JUDGE_MODEL" --max-turns 1 2>/dev/null || echo "")
cleanup_judge_sessions

# Judge unreachable / empty -> fail open.
[ -n "${verdict// /}" ] || exit 0

if printf '%s' "$verdict" | grep -qi '^[[:space:]]*FAIL'; then
  echo $((count + 1)) > "$counter"
  reason=$(printf '%s' "$verdict" | sed 's/^[[:space:]]*FAIL:[[:space:]]*//I')
  marker="↻ nach SOUL-Judge neu geschrieben — $reason"
  jq -nc --arg r "SOUL.md violation (Opus judge): $reason. Rewrite the reply to obey SOUL.md. End the rewritten reply with this exact final line so the rewrite is visible: $marker" \
    '{decision:"block", reason:$r}'
  exit 0
fi

rm -f "$counter"
exit 0
