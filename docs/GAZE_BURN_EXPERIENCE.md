# Gaze-Controlled Photo Burn: Agent Handoff

## Product intent

Build a browser experience where a person uploads a photo, calibrates webcam-based gaze tracking, then burns away the photo by looking at areas of it. The experience is gaze-only.

## Requirements agreed with the user

- Use webcam-based gaze estimation. It is an estimate of screen gaze, not literal retina tracking.
- Show the demo photo on page load. Calibrate against 16 targets in a 4×4 grid over that image before revealing the photo picker.
- Collect multiple samples at each target and map the gaze estimates to image-stage coordinates.
- Retain aggregated training data locally in browser storage for later sessions, reuse it across photos, and provide a way to clear or refine it.
- If gaze burning is inaccurate, provide an automatic quick in-place recalibration on visible portions of the current image; preserve the burn mask and resume after fitting. If the user is trying to look at already burnt areas, immediately initiate quick recalibration without waiting for the normal stall threshold.
- Only proceed after calibration is accepted. If it is inaccurate, let the user retry.
- Do not offer mouse or touch as an alternate input.
- Disable camera preview to keep the interface uncluttered and distraction-free while processing webcam frames in the background.
- Require camera permission and communicate that it is required. If permission, camera access, or tracking is unavailable, explain the issue and provide a retry path where possible; do not unlock the experience.
- The user holds gaze on a spot to ignite the fire. Once burning has started, it does not stop: realistic paper burning audio plays continuously via a dual-engine audio system (stock audio buffer + procedural cellulose combustion synthesizer and HTML5 audio with HTTP 206 range streaming and autoplay gesture unlocking), gaze continuously burns across the photo without dwell pauses, and active fire continues consuming the image until fully burned.
- Burning operates according to paper combustion physics:
  - Thermal buoyancy & convection elongation: rising hot air stretches flames and burn fronts upward.
  - Multi-stage combustion boundary: outer toasted scorch halo (`rgba(75, 38, 14, 0.45)`), heavy carbon char zone (`rgba(18, 12, 10, 0.9)`), and glowing ember combustion rim (`rgba(255, 110, 20, 0.92)`).
  - Organic cellulose tear paths: 20-vertex non-uniform quadratic curve paths replacing synthetic circular cuts.
  - Buoyant plasma particle dynamics: upward acceleration ($a_y = -0.0006 \text{ px/ms}^2$), additive blending (`lighter`) creating white-hot incandescent flame cores, high-velocity popped spark embers, and billowing ash smoke.
  - Deliberate, slow smoldering rate: gradual 180 ms gaze burn cadence, smaller incremental char radii (16–26 px), and throttled creeping ember fronts (capped at 10 active fronts advancing 3–6 px per step) providing a relaxed, meditative experience.
- Continue until the whole uploaded photo has been burned, then show completion and allow a restart or another upload. Audio stops and fire subsides on completion.
- Render fire, glow, and smoke as visual effects on screen only. There must be no physical flame.
- Process the webcam stream and uploaded image locally in the browser. Do not upload either to a server.

## Experience flow

1. Explain the camera requirement and request permission after a clear user action.
2. Start the camera and gaze estimator; show helpful status for unsupported browsers, missing cameras, or permission errors.
3. Run 16 calibration targets over the visible demo photo. Keep the face centered and move only the eyes.
4. Evaluate calibration quality. On failure, explain and allow a retry; on success, confirm, enable gaze burning on the demo, and reveal the photo picker.
5. Use the accepted model for the demo or chosen photo and map gaze into its rendered image coordinates, accounting for letterboxing and responsive layout.
6. If the user has trouble burning a spot (burning stalls with active gaze, or the user is trying to look at already burnt areas), automatically trigger quick recalibration on up to four still-visible image locations (immediately when looking at already burnt places). Keep the existing burn mask and resume burning with the refined model.
7. Require a configurable brief dwell before ignition. Keep a visible gaze indicator. Burn away only the area under the stable gaze point using an animated visual effect.
8. Detect when no image remains and show the completion state. Offer restart/re-upload; release camera resources when the experience is stopped or left.

## Implementation guidance

- Preserve the project's static HTML/CSS and native ES module architecture. Keep the new experience isolated from the existing posture-controlled games.
- Reuse appropriate browser/canvas and testing patterns, but do not couple gaze calibration to the existing full-body pose controls.
- Select a maintained gaze-estimation approach only after checking browser support, runtime/privacy behavior, model availability, and license. Do not claim accuracy the chosen approach cannot provide.
- Keep calibration, gaze mapping, burn state, and visual rendering separable enough to test. Prefer a canvas-based burn mask and animation for the image/fire composite.
- Stop camera tracks and cancel animation/timers on retry, completion, page exit, and error.
- Revoke temporary object URLs when an uploaded image is replaced or the experience is disposed.
- Handle camera denial, no camera, estimator/model load failure, no face/eyes detected, and calibration failure as explicit states. Never silently switch to another input.
- Avoid uploading, persisting, or logging camera frames or photo contents. Persist only aggregated calibration features in local browser storage and let users clear them.
- Use the existing `npm test` Node test runner; mock browser APIs and cover calibration gating, coordinate mapping, dwell/ignition, complete burn, retry, and cleanup.

## Decisions agents must keep explicit

The user has not selected a gaze library, calibration acceptance metric, dwell duration, burn brush size, or exact visual style. Inspect library options and project constraints, then choose sensible defaults and document them in the implementation. Keep the agreed gaze-only, demo-first 16-target calibration and local-processing behavior. Keep the entire interface within the viewport with no page scrolling.

## Current prototype choices

- The prototype uses MediaPipe Face Landmarker face/iris landmarks from a pinned CDN package and a 16-target ridge-regression calibration. It estimates gaze from eye landmarks; it is not a dedicated eye tracker, and calibration may be inaccurate on some devices.
- The MediaPipe WASM and face-landmarker model are fetched from public CDNs on first use. Camera frames and the selected photo remain in the browser; the app does not send them to a service.
- The prototype shows the included demo image on load. On first use, the user starts the camera and follows 16 targets on that image before the picker is revealed. Each animated target settles for 650 ms before collecting samples, requires at least 12 samples per target, and rejects highly inconsistent calibration. Accepted per-target averages are retained in local browser storage and reused across photos and page reloads, with actions to recalibrate or clear training. It uses a 650 ms dwell and a gaze-centered burn brush.
- Start the static localhost server with `node server.js` from this folder, then open `http://127.0.0.1:4173`. Internet access is currently needed to load the pinned MediaPipe code/model and hosted fonts.
