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
