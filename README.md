# Jump Analyzer

Jump Analyzer is a browser-based application for reviewing volleyball jump and spike mechanics from video. It uses React, TypeScript, and MediaPipe to track an athlete's pose and present motion data that can support form review.

The application's primary purpose is **jump-form analysis**. It is not a medical tool or a substitute for laboratory-grade motion capture.

[Open the live application](https://jump-analyzer.web.app)

> The current user interface is primarily in Japanese.

## Features

- Load a video from the user's device and inspect it frame by frame.
- Record takeoff and landing frames and calculate airtime.
- Select an athlete in the video and track their pose across frames with MediaPipe.
- Display joint angles, body movement, motion graphs, and detected jump phases.
- Summarize approach, takeoff, airborne posture, arm swing, and landing mechanics.
- Use optional manual calibration for supplemental estimates such as reach and ball speed.
- Run video analysis without creating an account.
- Sign in with Google or email and password to save selected analysis results to a private Firestore history.
- Install the application as a Progressive Web App (PWA).

## Privacy by Design

Selected video files are loaded through a browser object URL and processed in the browser. The current implementation does not upload video files to Firebase Storage or another external video service.

When an authenticated user explicitly saves an analysis, the analysis result and related metadata are stored in Firestore under that user's account. The video file itself is not included.

Always obtain permission before analyzing or sharing a video that contains another person. See the [Privacy Policy draft](PRIVACY_POLICY.md) and [Security Policy](SECURITY.md) for more information.

## Technology Stack

| Area | Technology |
|---|---|
| Application | React 19, TypeScript 6, Vite 8 |
| Pose estimation | MediaPipe Tasks Vision |
| Authentication and data | Firebase Authentication, Cloud Firestore |
| Hosting | Firebase Hosting |
| Offline and installation support | vite-plugin-pwa |
| Testing | Vitest |

## Requirements

- Node.js 20 or later
- npm
- A modern browser with WebAssembly support
- Firebase CLI only when deploying to Firebase Hosting

## Local Setup

### Windows PowerShell

```powershell
git clone https://github.com/rsktkd2003-afk/Jump-analyzer.git
Set-Location Jump-analyzer
Copy-Item .env.example .env.local
npm ci
npm run dev
```

### macOS or Linux

```bash
git clone https://github.com/rsktkd2003-afk/Jump-analyzer.git
cd Jump-analyzer
cp .env.example .env.local
npm ci
npm run dev
```

Vite prints the local development URL after startup.

The `predev` and `prebuild` scripts automatically copy the required MediaPipe runtime assets from `node_modules`.

## Firebase Configuration

Firebase is optional for local video analysis. If the required variables are missing, authentication and cloud history features are disabled while video analysis remains available.

To enable Firebase features, fill in `.env.local` with the Firebase Web App configuration:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Do not commit `.env.local`. The repository tracks only `.env.example`.

## Available Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run the Vitest test suite once |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run build` | Type-check and create a production build |
| `npm run check` | Run lint, tests, and the production build |
| `npm run preview` | Preview the production build locally |

## Production Deployment

Run the complete project check before deploying:

```powershell
npm ci
npm run check
npx firebase-tools deploy --only hosting
```

The configured Firebase Hosting site is `jump-analyzer`.

## Analysis Limitations

- Results are affected by camera angle, camera movement, lighting, resolution, frame rate, clothing, and body occlusion.
- MediaPipe produces estimates from a single 2D video. The output is not equivalent to calibrated multi-camera motion capture.
- Manual reach and ball-speed estimates depend on accurate point placement, timing, and distance calibration.
- Automated phases, scores, and comments are reference information for sports practice. Their acceptance thresholds are still being validated.
- The application must not be used for medical diagnosis, treatment decisions, or injury assessment.

See the [Analysis Specification](docs/ANALYSIS_SPEC.md) and [Validation Guide](docs/VALIDATION_GUIDE.md) for the current definitions and validation process.

## Project Documentation

- [Development Workflow](DEVELOPMENT_WORKFLOW.md)
- [Analysis Specification](docs/ANALYSIS_SPEC.md)
- [Validation Guide](docs/VALIDATION_GUIDE.md)
- [Release Checklist](docs/RELEASE_CHECKLIST.md)
- [Operations and Incident Response](docs/OPERATIONS.md)
- [Security Policy](SECURITY.md)
- [Privacy Policy draft](PRIVACY_POLICY.md)

## Contributing

Create a dedicated branch for each change and open a pull request against `main`. Before submitting a pull request, run:

```powershell
npm run check
```

Do not commit identifiable validation videos, raw personal data, credentials, or production environment files. When analysis formulas or thresholds change, update the relevant tests, documentation, and `ANALYSIS_VERSION`.
