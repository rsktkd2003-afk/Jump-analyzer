# Claude Code instructions

Before changing code, read and follow `AGENTS.md` at the repository root.

## Standard workflow

1. Inspect the relevant code and explain the current behavior.
2. For complex or high-risk work, present a short implementation plan before editing.
3. Ask the user when essential behavior or evaluation criteria are unclear.
4. Make only the requested changes.
5. Run `npm run lint`, `npm run test`, and `npm run build` when applicable.
6. Report changed files, check results, remaining risks, and manual verification steps in Japanese.

## Important constraints

- Do not redesign the UI unless explicitly requested.
- Do not modify scoring thresholds or volleyball technique definitions without confirming the exact rule.
- Do not weaken Firebase Authentication or Firestore security.
- Do not expose secrets or commit generated `dist` output.
- Do not make unrelated dependency upgrades or broad refactors.
- Never state that a check passed unless it was actually executed successfully.
