# GitHub Copilot repository instructions

Follow the complete repository guidance in `/AGENTS.md`.

- First inspect the relevant files and current behavior.
- Ask before implementing when requirements, scoring rules, units, frames, authentication behavior, or UI expectations are ambiguous.
- For multi-file or high-risk work, present a short plan before editing.
- Keep edits narrowly scoped. Do not add unrelated refactors, dependency upgrades, features, or visual changes.
- Preserve the existing React, TypeScript, Vite, Firebase, MediaPipe, PWA, data, authentication, authorization, and responsive architecture.
- Treat motion tracking, form evaluation, authentication, Firestore, and PWA caching as high-risk.
- Never add secrets, tokens, passwords, or personal data.
- Run `npm run check` when all checks apply, or run the relevant lint, test, and build commands individually.
- Inspect `git status` and `git diff` before reporting completion.
- Report changed files, command results, risks, unverified items, manual verification steps, and the next PowerShell commands in Japanese.
- Do not commit, push, merge, or deploy without explicit user instruction.
- Do not claim that a check passed unless the corresponding command was actually run successfully.
