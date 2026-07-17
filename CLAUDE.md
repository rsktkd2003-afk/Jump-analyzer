@AGENTS.md

# Claude Code instructions

## Standard workflow

1. Inspect the relevant code and explain the current behavior.
2. For complex, multi-file, or high-risk work, present a short implementation plan before editing.
3. Ask the user when essential behavior or evaluation criteria are unclear.
4. Make only the requested changes.
5. Run `npm run check` when all checks apply, or run the relevant lint, test, and build commands individually.
6. Inspect `git status` and `git diff` before reporting completion.
7. Report changed files, check results, remaining risks, manual verification steps, and the developer's next PowerShell commands in Japanese.

## Important constraints

- Do not redesign the UI unless explicitly requested.
- Do not modify scoring thresholds or volleyball technique definitions without confirming the exact rule.
- Do not weaken Firebase Authentication or Firestore security.
- Do not expose secrets or commit generated `dist` output.
- Do not make unrelated dependency upgrades or broad refactors.
- Do not commit, push, merge, or deploy without explicit user instruction.
- Never state that a check passed unless it was actually executed successfully.
