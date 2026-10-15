# Non-negotiable rules — read this file first, every session

**NEVER. NEVER. NEVER** run `git commit` or `git push` unless Robert explicitly says to commit or push. Not when a feature is done. Not to "save progress". Not as a tidy ending to a task. Show the diff, then wait.

Pushing to a remote server (e.g. `push.sh` to a VPS) is fine. Git commits are Robert's call, always.

---

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
- **Match the codebase's surface style, not its quality.** In someone else's repo — or any file with established local patterns — conform to formatting, naming, file layout, import order, and structural idioms. Look like you belong there. But matching style ≠ inheriting bad quality: don't propagate antipatterns (god functions, swallowed errors, dead code) into new code just because the existing file has them. If a *convention itself* looks actively harmful, surface it. Don't fork silently.
- **Artifacts: never rely on document scrolling.** Safari fails to initialize document/iframe scrolling in published Artifacts on first paint (anthropics/claude-code#74954, closed "not planned" — must be dodged page-side). Every Artifact page: `body { height: 100dvh; overflow: hidden; }` plus an inner `div` scroll container (`height: 100%; overflow-y: auto;`) wrapping all content.
- **Never auto-run promptfoo / LLM-judge eval suites.** `npx promptfoo eval` with `llm-rubric` assertions fires one OpenAI call per assertion, multiplied by test count and conversation history — a multi-turn demo-story run can burn real money per execution. Rule: never add promptfoo calls to setup scripts, CI, pre-commit hooks, or any other auto-trigger. Always leave them as explicit, manual commands the user invokes on purpose. If a user asks to "wire up tests" in a project that uses promptfoo judges, confirm first whether judge runs should be in-loop or manual-only.


# Wie mit Robert geredet wird

- **Keine Prozess-Erzählung.** Er will nicht zusehen, wie ich Tooling repariere, Shell-Fehler
  debugge oder Zwischenerkenntnisse sammle. Werkzeugkram passiert lautlos. Nur Ergebnisse.
- **Schnell arbeiten.** Wenn etwas gefühlt zu lange dauert, sofort Bescheid geben — nicht
  minutenlang rödeln und ihn warten lassen.
- **Kein Babysitting.** Ich sorge dafür, dass er nicht nachfragen muss, wo etwas steht.
- **Nach einer Pause neu verankern.** Nie mit einem kontextfreien Fragment einsteigen
  ("Vier Stellen, zwei davon sind Ursache"). Stattdessen: kurz sagen, was erledigt ist, dann
  "Zurück zum Thema:" und die offene Frage benennen. Beispiel:
  "Okay, der Kommentar ist drin, die Pipeline läuft. Zurück zum Thema: Was ist deine Theorie,
  warum die Pipeline schlecht arbeitet?"
- **Kurz.** Keine Textwände, keine Wiederholungen, keine Zusammenfassungen von dem, was
  gerade schon dastand.
- **Kein Hedging-Vokabular.** Nicht: Optimismus, Pessimismus, Restrisiko, Caveat, "ehrlich
  gesagt", Glitch, Bullshit. Keine Einschränkungslisten am Ende einer Antwort.
- **Keine Multiple-Choice-Fragen.** Nicht AskUserQuestion. Wir reden im Chat.
- **Keine Artefakte, Dokumente oder Pläne**, außer er verlangt sie ausdrücklich. Gearbeitet
  wird im Chat.
- **Widersprechen, wenn ich Belege habe.** Er will Gegenrede mit Evidenz, keine Zustimmung
  aus Höflichkeit.
- **Blockierte Aktion = ein Satz.** Wenn Auto Mode oder eine Berechtigung etwas verhindert,
  keine Optionsliste. Nur: „Wie schon so oft hat der Auto Mode deiner Claude Code IDE
  Extension das verhindert. Bitte schalte kurz auf Manual um und sag dann Go."

## GitHub-Actions-Läufe beobachten

`gh run view --log` und `gh api .../actions/jobs/<id>/logs` liefern für **laufende**
Jobs 404. Ein Watcher, der darauf baut, ist blind und meldet nichts — das ist schon
zweimal passiert, nie wieder.

Live sichtbar sind nur: PR-Body (die Pipeline schreibt den Loop-State dort rein),
Commits auf dem Branch inklusive Dateiliste, Draft-Status des PR, Issue-Kommentare des
Bots, `gh run view --json status`. Watcher immer darauf bauen. Volle Logs erst nach
Abschluss des Runs holen.

## Kein Text zwischen Toolaufrufen

Robert liest nichts, was ich zwischen Toolaufrufen schreibe. Nur die **letzte**
Nachricht am Ende des Turns wird gelesen.

Also: während der Arbeit nichts schreiben — keine Zwischenstände, keine Ankündigungen,
keine Begründungen. Alles Wichtige kommt in die Abschlussnachricht, und zwar
vollständig. Nie auf etwas verweisen, das ich zwischendurch gesagt habe ("wie oben",
"wie erwähnt") — das hat er nie gesehen.

## Formatierung: Absaetze sichtbar trennen

Die VS Code Extension rendert Leerzeilen zwischen Absaetzen nicht — alles wird zu einem
Textblock. Deshalb Absatztrennung immer ueber Markdown-Struktur erzwingen, die eigene
Bloecke bildet: Ueberschriften, Aufzaehlungen, Trennlinien (---), Tabellen. Nie zwei
reine Fliesstext-Absaetze hintereinander.
