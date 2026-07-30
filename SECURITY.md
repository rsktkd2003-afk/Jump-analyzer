# Security Policy

Last updated: July 30, 2026

## Supported Versions

Security fixes are applied to the latest code on the `main` branch and, when applicable, to the current Firebase Hosting deployment. Older commits, local builds, and superseded deployments may not receive security updates.

## Reporting a Vulnerability

Do not disclose a vulnerability through a public issue, pull request, discussion, or screenshot if the report contains exploit details, credentials, personal information, account identifiers, private analysis data, or video content.

Use GitHub's private vulnerability reporting option if it is available for this repository. Otherwise, contact the repository owner through a private channel. If no private channel is available, open a minimal public issue asking how to submit a private security report, without including technical details.

A useful report includes:

- The affected URL, branch, commit, or application version.
- The affected component, such as authentication, Firestore Rules, PWA caching, or client-side video handling.
- Reproduction steps using only accounts and data that you are authorized to test.
- The security impact and the conditions required for exploitation.
- Sanitized logs, screenshots, or proof-of-concept material that does not expose personal data.
- Any suggested mitigation, if known.

This is a personal project and does not currently provide a guaranteed response or resolution time. Reports will be assessed and fixes will be coordinated privately when possible.

## Security Scope

Examples of security issues that are in scope include:

- Authentication bypass or session-handling vulnerabilities.
- Cross-account access to Firestore analysis histories.
- Firestore Security Rules that allow unauthorized reads, writes, updates, or deletion.
- Unexpected upload, disclosure, or external transmission of a selected video.
- Cross-site scripting, unsafe content handling, or service-worker vulnerabilities.
- Exposure of service-account credentials, private keys, access tokens, or other server-side secrets.
- Dependency or build-chain vulnerabilities that are exploitable in this application.

Analysis accuracy, scoring disagreements, unsupported browsers, and general feature defects should be reported as normal issues unless they also create a security or privacy impact.

## Current Security and Privacy Controls

### Client-side video processing

- A selected video is loaded with `URL.createObjectURL` and processed in the browser.
- The current implementation does not upload video files to Firebase Storage or another external video service.
- Identifiable validation videos must not be committed to the public repository.

### Authentication and stored results

- Video analysis remains available without authentication.
- Firebase Authentication is used for Google sign-in and email/password accounts.
- Analysis results are stored only when an authenticated user explicitly chooses to save them.
- Stored histories use the path `users/{uid}/analysisHistories/{analysisId}`.

### Firestore access control

The current Firestore Rules:

- Require an authenticated user whose UID matches the requested user document.
- Prevent one user from reading or deleting another user's analysis history.
- Require `userId` in a newly created history to match the authenticated user.
- Require a newly created history's `analysisId` to match its Firestore document ID.
- Prevent an update from changing a history to another user's UID.

Authorization must be enforced by Firestore Security Rules. Client-side checks are for user experience only and must not be treated as a security boundary.

### Environment and secret handling

- `.env*` files are ignored by Git, except for the placeholder `.env.example`.
- Firebase Web App configuration values exposed through `VITE_*` identify the client application; they are not a substitute for authorization and must not be treated as server-side secrets.
- Service-account JSON files, private keys, access tokens, signing keys, and administrative credentials must never be placed in `VITE_*` variables or committed to the repository.
- If a real secret is exposed, revoke or rotate it immediately and remove it from all reachable Git history and deployment systems.

### Diagnostic data

Application error records must not include:

- Video files or frames.
- Raw pose landmarks or skeleton coordinates.
- Firebase UIDs, display names, or email addresses.
- Analysis-history titles, notes, or other user-authored content.

## Developer Security Checklist

Run the following checks before release:

```powershell
npm ci
npm run check
npm audit
```

When authentication, Firestore data structures, or Firestore Rules change, verify at minimum that:

- An unauthenticated client cannot read or write protected documents.
- User A cannot read, create, update, or delete User B's history.
- A history cannot be created with a different `userId`.
- A history cannot be created when its `analysisId` differs from the document ID.
- Existing unauthenticated video analysis still works without exposing cloud data.

Use the Firebase Emulator Suite for rule validation before deploying rule changes. Test with synthetic data rather than real user videos or personal information.

## Responsible Testing

- Test only accounts, projects, devices, and data that you own or are explicitly authorized to use.
- Do not access, modify, retain, or disclose another user's data.
- Stop testing if you encounter unexpected personal information.
- Do not perform denial-of-service testing against the public deployment.
- Allow reasonable time for assessment and remediation before public disclosure.

## Known Security Gaps

The following items are not yet confirmed as complete:

- Automated Firestore Rules tests in the Firebase Emulator Suite.
- A persistent production error-monitoring service.
- A dedicated security contact address.
- A verified self-service flow that deletes an account and all associated history.
- A formal Firestore backup, retention, and recovery policy.

These limitations must be reviewed before the application is used by a larger audience or stores higher-risk data.
