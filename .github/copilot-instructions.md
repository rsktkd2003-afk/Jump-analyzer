# GitHub Copilot repository instructions

Follow the complete repository guidance in `/AGENTS.md`.

- First inspect the relevant files and current behavior.
- Ask before implementing when requirements, scoring rules, units, frames, authentication behavior, or UI expectations are ambiguous.
- Keep edits narrowly scoped. Do not add unrelated refactors, dependency upgrades, or visual changes.
- Preserve the existing React, TypeScript, Vite, Firebase, MediaPipe, and PWA architecture.
- Treat motion tracking, form evaluation, authentication, Firestore, and PWA caching as high-risk.
- Never add secrets, tokens, passwords, or personal data.
- Run `npm run lint`, `npm run test`, and `npm run build` when applicable.
- Report changed files, command results, risks, and manual verification steps in Japanese.
- Do not claim that a check passed unless the corresponding command was actually run successfully.
