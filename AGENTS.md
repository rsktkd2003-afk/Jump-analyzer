# Jump Analyzer — agent guidance

## Project overview

- React 19 + TypeScript + Vite 8.
- PWA support is configured with `vite-plugin-pwa`.
- Firebase is used for authentication, Firestore data, and Hosting.
- MediaPipe Tasks Vision is used for pose and motion analysis.
- The product language and user-facing explanations are primarily Japanese.

## Working rules

1. Inspect `README.md`, relevant documentation, relevant files, and existing behavior before editing.
2. If a requirement, scoring rule, unit, frame definition, or expected UI behavior is ambiguous, ask before implementing.
3. For a multi-file or high-risk change, present a short implementation plan before editing.
4. Keep changes limited to the requested task. Do not perform unrelated refactors, dependency upgrades, feature additions, or design changes.
5. Preserve existing functionality, visual design, data structures, authentication, authorization, and responsive behavior unless the task explicitly requests a change.
6. Treat existing uncommitted changes as user work. Never discard or overwrite them without explicit approval.
7. Never add API keys, Firebase secrets, tokens, passwords, or private user data to the repository.
8. Do not silently change volleyball evaluation criteria. State the current formula and the proposed formula before changing analysis logic.
9. Treat pose tracking, smoothing, frame selection, unit conversion, authentication, Firestore rules, and PWA caching as high-risk areas.
10. Prefer small, reviewable changes. Explain every changed file in the final report.
11. Write implementation summaries and user-facing explanations in Japanese unless asked otherwise.

## Required verification

Run the checks relevant to the change:

```powershell
npm run lint
npm run test
npm run build
```

Alternatively, run the combined check when all three checks apply:

```powershell
npm run check
```

Do not claim that a check passed unless the corresponding command was actually run successfully.

For UI, authentication, video, tracking, PWA, or Firestore changes, also provide a short manual verification checklist. The developer must verify browser behavior with `npm run dev`.

Before reporting completion, inspect `git status` and `git diff` for unintended changes.

## Git and deployment

- Do not commit, push, merge, or deploy unless the user explicitly requests that action.
- Do not work directly on `main`; use a task branch.
- Do not run destructive operations such as `git reset --hard`, `git clean`, force push, or recursive deletion without explicit approval.

## Definition of done

- The requested behavior is implemented.
- Unrelated behavior and UI remain unchanged.
- Lint, test, and build results are reported accurately.
- High-risk assumptions are documented.
- Changed files and manual checks are listed.
- No secrets or generated build output are committed.

## Completion report

Always report:

1. Changed files.
2. Implemented behavior.
3. Checks and manual verification performed.
4. Remaining issues or unverified items.
5. The next PowerShell commands for the developer.

## Review guidelines

When reviewing a pull request, prioritize:

- authentication or authorization bypasses;
- unsafe Firestore reads and writes;
- leaked credentials or personal information;
- regressions in video loading, pose tracking, frame/time calculations, or unit conversions;
- scoring logic that does not match the documented volleyball criteria;
- mobile layout regressions;
- PWA cache or deployment behavior that can leave users on stale or broken assets;
- large unrelated changes hidden inside a feature or bug fix.
