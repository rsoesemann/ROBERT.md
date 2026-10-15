#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

mkdir -p ~/.claude/skills ~/.codex

# One instruction file for every agent: Claude Code reads CLAUDE.md, Codex reads AGENTS.md.
for target in ~/.claude/CLAUDE.md ~/.codex/AGENTS.md; do
    # A real file here is a stale copy; keep it as .bak instead of silently overwriting it.
    if [ -f "$target" ] && [ ! -L "$target" ]; then
        mv "$target" "$target.bak"
    fi
    ln -sfn "$SCRIPT_DIR/AGENTS.md" "$target"
done
ln -sfn "$SCRIPT_DIR/claude/settings.json" ~/.claude/settings.json
ln -sfn "$SCRIPT_DIR/claude/rules" ~/.claude/rules

# Symlink each skill individually (not the whole directory).
# This lets multiple repos (personal, company) contribute skills to ~/.claude/skills/.
for skill_dir in "$SCRIPT_DIR"/claude/skills/*/; do
    skill_name=$(basename "$skill_dir")
    target=~/.claude/skills/"$skill_name"

    # ln -sfn can replace a symlink but not a real directory.
    # If the target is a real directory (from a previous manual copy), remove it first.
    if [ -d "$target" ] && [ ! -L "$target" ]; then
        rm -rf "$target"
    fi

    ln -sfn "$skill_dir" "$target"
done

echo "Done. Symlinks created in ~/.claude/ and ~/.codex/"
echo ""
echo "  ~/.claude/CLAUDE.md     -> AGENTS.md"
echo "  ~/.codex/AGENTS.md      -> AGENTS.md"
echo "  ~/.claude/settings.json -> claude/settings.json"
echo "  ~/.claude/rules/        -> claude/rules/"
for skill_dir in "$SCRIPT_DIR"/claude/skills/*/; do
    skill_name=$(basename "$skill_dir")
    echo "  ~/.claude/skills/$skill_name/ -> claude/skills/$skill_name/"
done
echo ""
echo "Start a new Claude Code or Codex session to pick up the changes."
