# Project Guidelines

## Project structure
- This is a static browser app using native JavaScript ES modules; avoid introducing a framework.
- Existing games are wired through page-specific HTML, CSS, and modules under `js/`. Follow nearby patterns and keep new experiences isolated from existing game flows.
- Read [docs/GAZE_BURN_EXPERIENCE.md](docs/GAZE_BURN_EXPERIENCE.md) before implementing the gaze-controlled photo-burning experience.

## Browser and privacy requirements
- Webcam gaze is approximate; do not describe it as direct retina tracking or promise medical-grade accuracy.
- The gaze-burning experience requires camera permission and one successful 16-point calibration, reused for all photos and page reloads. Keep only aggregated training features in browser storage, with a way to clear or refine them. Do not add mouse or touch interaction as a fallback.
- Keep camera/image processing local in the browser unless the user explicitly approves a change to that privacy model.
- Fire is an on-screen visual simulation only; never use or propose physical flames.

## Validation
- Run focused tests while developing and `npm test` for a final check when practical.
- Tests use Node's built-in test runner. Add coverage for new gaze, calibration, burn, and error-state behavior.
- Webcam access requires a secure context (HTTPS, or localhost).
