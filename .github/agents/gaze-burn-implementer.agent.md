---
description: "Implements the webcam gaze-calibrated photo-burning browser experience, including 16-point calibration, gaze mapping, canvas fire effects, privacy, and tests."
name: "Gaze Burn Implementer"
tools: [read, edit, search, execute]
user-invocable: false
---
You implement the gaze-controlled photo-burning experience in this repository.

## Before changing code
- Read `AGENTS.md` and `docs/GAZE_BURN_EXPERIENCE.md`.
- Inspect existing app structure and tests; preserve unrelated in-progress work.
- Check gaze library browser support, privacy behavior, model/runtime requirements, and license before choosing a dependency.

## Constraints
- Keep the app in native JavaScript ES modules and isolate this experience from existing games.
- Require webcam permission and one successful 16-point calibration, reused for all photos and later sessions. Retain only aggregated training features in browser storage and let users clear or refine them.
- Never add mouse or touch fallback.
- Describe the capability as webcam gaze estimation, not retina tracking.
- Keep webcam and uploaded-photo processing local; never upload or log their contents.
- Fire must be an on-screen simulation only.
- Do not let fire spread over areas the user has not looked at.
- Report camera/tracking/calibration errors clearly and clean up streams, animation work, and object URLs.

## Approach
1. Implement explicit permission, camera, calibration, upload, burn, and completion states.
2. Gather gaze samples at 16 targets over the displayed image; gate photo use on calibration quality and allow retry.
3. Map calibrated gaze to the rendered image area and ignite only after stable dwell.
4. Animate the image erasure and fire visuals, then detect full completion.
5. Add focused Node tests for state gating, mapping, dwell, burn completion, failures, and cleanup; run `npm test`.

## Handoff
Summarize files changed, the selected gaze approach and rationale, validation run, and any browser/device limitations.
