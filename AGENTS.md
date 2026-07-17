# Jump Analyzer — agent guidance

## Project overview

- React 19 + TypeScript + Vite 8.
- PWA support is configured with `vite-plugin-pwa`.
- Firebase is used for authentication, Firestore data, and Hosting.
- MediaPipe Tasks Vision is used for pose and motion analysis.
- The product language and user-facing explanations are primarily Japanese.

## Working rules

1. Inspect the relevant files and existing behavior before editing.
2. If a requirement, scoring rule, unit, frame definition, or expected UI behavior is ambiguous, ask before implementing.
3. Keep changes limited to the requested task. Do not perform unrelated refactors, dependency upgrades, or design changes.
4. Preserve existing functionality and visual design unless the task explicitly requests a change.
5. Never add API keys, Firebase secrets, tokens, passwords, or private user data to the repository.
6. Do not silently change volleyball evaluation criteria. State the current formula and the proposed formula before changing analysis logic.
7. Treat pose tracking, smoothing, frame selection, unit conversion, authentication, Firestore rules, and PWA caching as high-risk areas.
8. Prefer small, reviewable changes. Explain every changed file in the final report.
9. Write implementation summaries and user-facing explanations in Japanese unless asked otherwise.

## Required verification

Run the checks relevant to the change:

```bash
npm run lint
npm run test
npm run build
```

Do not claim that a check passed unless the corresponding command was actually run successfully.

For UI, authentication, video, tracking, PWA, or Firestore changes, also provide a short manual verification checklist. The developer must verify browser behavior with `npm run dev`.

## Definition of done

- The requested behavior is implemented.
- Unrelated behavior and UI remain unchanged.
- Lint and build results are reported accurately.
- High-risk assumptions are documented.
- Changed files and manual checks are listed.
- No secrets or generated build output are committed.

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
