import {
  aggregateCalibrationSamples,
  ALL_TRAINING_POINTS,
  AUTO_RECALIBRATE_COOLDOWN_MS,
  AUTO_RECALIBRATE_STALL_MS,
  CALIBRATION_POINTS,
  createCalibrationFromBaseline,
  DwellTracker,
  ERROR_CORRECTION_POINTS,
  expandGazeFeatures,
  extractGazeFeatures,
  fitCalibration,
  getImagePhase,
  isCalibrationPointSettled,
  isTryingToLookAtBurnt,
  mapGazeToRect,
  MAX_CALIBRATION_POINT_COUNT,
  predictGaze,
  QUICK_CALIBRATION_POINT_COUNT,
  shouldTriggerAutoRecalibration,
} from "./gaze.js";
import { BurnRenderer } from "./burn-renderer.js";
import { SoundEngine } from "./sound-engine.js";

const VISION_MODULE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";
const MAX_CALIBRATION_RMSE = 0.18;
const TRAINING_STORAGE_KEY = "gaze-burn-training";
const LEGACY_TRAINING_STORAGE_KEY = "gaze-burn-training-v1";
const status = document.querySelector("#status");
const camera = document.querySelector("#camera");
const cameraCard = document.querySelector(".camera-card");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const cameraState = document.querySelector("#camera-state");
const startButton = document.querySelector("#start-camera");
const retryButton = document.querySelector("#retry-calibration");
const quickCalibrationButton = document.querySelector("#quick-calibration");
const uploadControl = document.querySelector("#upload-control");
const clearTrainingButton = document.querySelector("#clear-training");
const stopButton = document.querySelector("#stop-camera");
const calibrationPanel = document.querySelector("#calibration-panel");
const calibrationInstructions = document.querySelector("#calibration-instructions");
const calibrationTarget = document.querySelector("#calibration-target");
const calibrationCount = document.querySelector("#calibration-count");
const calibrationHint = document.querySelector("#calibration-hint");
const calibrationTitle = document.querySelector("#calibration-title");
const photoFile = document.querySelector("#photo-file");
const photoCanvas = document.querySelector("#photo-canvas");
const flameCanvas = document.querySelector("#flame-canvas");
const burnStage = document.querySelector("#burn-stage");
const stageEmpty = document.querySelector("#stage-empty");
const completeMessage = document.querySelector("#complete-message");
const burnAgainButton = document.querySelector("#burn-again");
const restartBurnButton = document.querySelector("#restart-burn");
const gazeCursor = document.querySelector("#gaze-cursor");
const gazeStatus = document.querySelector("#gaze-status");
const burnStatus = document.querySelector("#burn-status");
const burnHint = document.querySelector("#burn-hint");
const burnAudio = document.querySelector("#burn-audio");
const audioToggle = document.querySelector("#audio-toggle");
const welcomeModal = document.querySelector("#welcome-modal");
const trySamplesButton = document.querySelector("#try-samples");
const completeSamplesButton = document.querySelector("#complete-samples");
const nazarCountdown = document.querySelector("#nazar-countdown");
const countdownNumber = document.querySelector("#countdown-number");
const countdownProgress = document.querySelector("#countdown-progress");
const countdownHint = document.querySelector("#countdown-hint");
const countdownCalibrationPill = document.querySelector("#countdown-calibration-pill");
const countdownCalibrationLabel = document.querySelector("#countdown-calibration-label");

const deskImg = new Image();
deskImg.src = "./assets/burnt-desk.jpg";
deskImg.onload = () => {
  if (renderer) renderer.loadDeskImage(deskImg);
};

let stream = null;
let landmarker = null;
let model = null;
let phase = "idle";
let targetIndex = 0;
let targetStartedAt = 0;
let targetSamples = [];
let calibrationSamples = [];
let pendingCalibrationSamples = [];
let quickCalibrationTargets = null;
let lastDetectionAt = 0;
let smoothedPoint = null;
let photoUrl = null;
let animationFrame = 0;
let lastFrameAt = 0;
let lastBurnAt = 0;
let unburnedGazeElapsed = 0;
let autoRecalibrateCooldownUntil = 0;
let calibrationTimeout = 0;
let renderer = null;
let currentImageIsDemo = false;
let trainingStorageWarning = "";
let hasStoredTraining = false;
let hasStartedBurning = false;
let countdownActive = false;
let countdownStart = 0;
const COUNTDOWN_DURATION_MS = 3000;
let countdownSamples = [];
let countdownCalibrating = false;
let countdownLastSecond = -1;
let ashTimeout = 0;
const dwell = new DwellTracker({ dwellMs: 200, radius: 48 });

const soundEngine = new SoundEngine({
  audioElement: burnAudio,
  stockUrl: "./assets/Amazing Paper burning sound.mp3",
  fallbackUrl: "./assets/paper-burn.ogg",
  secondaryUrl: "./assets/paper-burn.mp3",
  volume: 0.85,
  muted: false,
  onStateChange: ({ isMuted, isPlaying }) => {
    if (audioToggle) {
      audioToggle.textContent = isMuted ? "🔇" : "🔊";
      audioToggle.setAttribute("aria-label", isMuted ? "Unmute burning sound" : "Mute burning sound");
      audioToggle.setAttribute("title", isMuted ? "Unmute sound" : "Mute sound");
      audioToggle.dataset.playing = String(isPlaying && !isMuted);
    }
    if (hasStartedBurning && phase === "burning") {
      if (!isMuted && !isPlaying) {
        burnHint.textContent = "🔊 Tap anywhere to enable sound";
      } else {
        burnHint.textContent = "Look to burn";
      }
    }
  },
});

function playBurnAudio() {
  soundEngine.play();
}

function pauseBurnAudio() {
  soundEngine.pause();
}

function stopBurnAudio(options) {
  soundEngine.stop(options);
}

function unlockSound() {
  soundEngine.unlock();
  if (hasStartedBurning && phase === "burning" && !soundEngine.muted && !soundEngine.isPlaying) {
    soundEngine.play();
  }
}

window.addEventListener("pointerdown", unlockSound);
window.addEventListener("click", unlockSound);
window.addEventListener("keydown", unlockSound);
window.addEventListener("touchstart", unlockSound, { passive: true });

if (audioToggle) {
  audioToggle.addEventListener("click", () => {
    soundEngine.unlock();
    const nowMuted = soundEngine.toggleMute();
    if (!nowMuted && hasStartedBurning && phase === "burning") {
      soundEngine.play();
    }
  });
}

function setStatus(message, kind = "") {
  status.textContent = message;
  status.dataset.kind = kind;
}

function syncQuickCalibrationButton() {
  quickCalibrationButton.hidden = !(phase === "burning" && model && stream && renderer && !renderer.complete && !countdownActive);
}

function syncBurnAgainButton() {
  if (restartBurnButton) {
    restartBurnButton.hidden = !(renderer?.image && (phase === "burning" || phase === "complete") && !countdownActive && phase !== "ash");
  }
}

function syncControlButtons() {
  syncQuickCalibrationButton();
  syncBurnAgainButton();
}

function loadTrainingData() {
  try {
    const stored = localStorage.getItem(TRAINING_STORAGE_KEY);
    if (!stored) {
      hasStoredTraining = Boolean(localStorage.getItem(LEGACY_TRAINING_STORAGE_KEY));
      if (hasStoredTraining) {
        trainingStorageWarning = "Your saved 9-point calibration needs one retrain for the new 16-point grid.";
      }
      return [];
    }
    hasStoredTraining = true;
    const data = JSON.parse(stored);
    if (data.version === 1) {
      throw new Error("Your saved 9-point calibration needs one retrain for the new 16-point grid.");
    }
    if (data.version !== 2 || !Array.isArray(data.samples)
      || data.samples.length < CALIBRATION_POINTS.length
      || data.samples.length > MAX_CALIBRATION_POINT_COUNT) {
      throw new Error("saved training data has an unsupported format");
    }
    const seenTargets = new Set();
    for (const sample of data.samples) {
      if (!Number.isInteger(sample.targetIndex)
        || sample.targetIndex < 0
        || sample.targetIndex >= MAX_CALIBRATION_POINT_COUNT
        || seenTargets.has(sample.targetIndex)
        || sample.features?.length !== 6
        || !sample.features.every(Number.isFinite)
        || !Number.isFinite(sample.weight)
        || sample.weight < 12
        || !Number.isFinite(sample.target?.x)
        || !Number.isFinite(sample.target?.y)
        || sample.target.x < 0
        || sample.target.x > 1
        || sample.target.y < 0
        || sample.target.y > 1
        || (sample.targetIndex < CALIBRATION_POINTS.length
          && (sample.target.x !== CALIBRATION_POINTS[sample.targetIndex].x
            || sample.target.y !== CALIBRATION_POINTS[sample.targetIndex].y))) {
        throw new Error("saved training data failed validation");
      }
      seenTargets.add(sample.targetIndex);
    }
    if (CALIBRATION_POINTS.some((_, index) => !seenTargets.has(index))) {
      throw new Error("saved gaze training data is missing calibration points");
    }
    const result = fitCalibration(data.samples, { useExpansion: true });
    if (!result.ok) throw new Error(result.reason);
    model = result.model;
    return data.samples;
  } catch (error) {
    trainingStorageWarning = hasStoredTraining
      ? `${error?.message || "Saved training has an unsupported format."} New training will replace it.`
      : `Saved gaze training couldn't be loaded: ${error?.message || "storage is unavailable"}. New training will replace it.`;
    return [];
  }
}

function saveTrainingData(samples) {
  try {
    localStorage.setItem(TRAINING_STORAGE_KEY, JSON.stringify({ version: 2, samples }));
    trainingStorageWarning = "";
    hasStoredTraining = true;
  } catch (error) {
    trainingStorageWarning = `Local training couldn't be saved: ${error?.message || "browser storage is unavailable"}.`;
    return false;
  }
  try {
    localStorage.removeItem(LEGACY_TRAINING_STORAGE_KEY);
    return true;
  } catch (error) {
    trainingStorageWarning = `New training was saved, but old training couldn't be removed: ${error?.message || "browser storage is unavailable"}.`;
    return false;
  }
}

calibrationSamples = loadTrainingData();
clearTrainingButton.hidden = calibrationSamples.length === 0 && !hasStoredTraining;
if (model) {
  status.textContent = "Saved calibration found. Click Start burning.";
  startButton.textContent = "Start burning";
} else if (trainingStorageWarning) {
  status.textContent = trainingStorageWarning;
}

function setTargetPosition() {
  const points = phase === "quick-calibrating" ? quickCalibrationTargets : ALL_TRAINING_POINTS;
  const target = points?.[targetIndex] ?? CALIBRATION_POINTS[targetIndex];
  const stageRect = burnStage.getBoundingClientRect();
  const imageRect = renderer?.imageRect;
  if (!imageRect || !stageRect.width || !stageRect.height || !target) return;
  calibrationTarget.style.left = `${((imageRect.x + target.x * imageRect.width) / stageRect.width) * 100}%`;
  calibrationTarget.style.top = `${((imageRect.y + target.y * imageRect.height) / stageRect.height) * 100}%`;
}

function stopTracks() {
  if (stream) {
    for (const track of stream.getTracks()) track.stop();
  }
  stream = null;
  camera.srcObject = null;
  cameraCard.dataset.active = "false";
  cameraPlaceholder.hidden = false;
  cameraState.textContent = "CAMERA OFF";
  gazeCursor.style.display = "none";
}

function closeLandmarker() {
  if (!landmarker) return;
  const activeLandmarker = landmarker;
  landmarker = null;
  void activeLandmarker.close();
}

function releasePhotoUrl() {
  if (photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl = null;
}

function stopAnimation() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  lastFrameAt = 0;
}

function clearCalibration() {
  targetSamples = [];
  pendingCalibrationSamples = [];
  quickCalibrationTargets = null;
  targetIndex = 0;
  clearTimeout(calibrationTimeout);
  calibrationPanel.hidden = true;
  calibrationInstructions.hidden = true;
}

function cancelNazarCountdown() {
  clearTimeout(ashTimeout);
  countdownActive = false;
  countdownSamples = [];
  if (nazarCountdown) {
    nazarCountdown.hidden = true;
    nazarCountdown.setAttribute("hidden", "");
    nazarCountdown.style.display = "none";
  }
}

function startNazarCountdown({ forceRecalibrate = false } = {}) {
  if (!renderer?.image) return;
  clearCalibration();
  dwell.reset();
  hasStartedBurning = false;
  stopBurnAudio();

  if (welcomeModal) {
    welcomeModal.hidden = true;
    welcomeModal.setAttribute("hidden", "");
    welcomeModal.style.display = "none";
  }
  if (completeMessage) {
    completeMessage.hidden = true;
    completeMessage.setAttribute("hidden", "");
    completeMessage.style.display = "none";
  }
  stageEmpty.hidden = true;

  countdownActive = true;
  countdownStart = performance.now();
  countdownSamples = [];
  countdownLastSecond = -1;
  countdownCalibrating = forceRecalibrate || !model;

  if (nazarCountdown) {
    nazarCountdown.hidden = false;
    nazarCountdown.removeAttribute("hidden");
    nazarCountdown.style.display = "flex";
    if (countdownNumber) {
      countdownNumber.textContent = "3";
      countdownNumber.classList.remove("pulse");
      void countdownNumber.offsetWidth;
      countdownNumber.classList.add("pulse");
    }
    if (countdownProgress) {
      countdownProgress.style.strokeDashoffset = "0";
    }
    if (countdownCalibrationPill) {
      countdownCalibrationPill.hidden = !countdownCalibrating;
      if (!countdownCalibrating) {
        countdownCalibrationPill.setAttribute("hidden", "");
      } else {
        countdownCalibrationPill.removeAttribute("hidden");
      }
    }
    if (countdownHint) {
      countdownHint.textContent = countdownCalibrating
        ? "Lock eyes with the target · Calibrating gaze"
        : "Lock your eyes on their face";
    }
  }

  gazeCursor.style.display = "none";
  gazeStatus.textContent = countdownCalibrating ? "CALIBRATING" : "READY";
  burnStatus.textContent = "";
  burnHint.textContent = "Starting nazar…";
  setStatus(countdownCalibrating
    ? "Starting nazar in 3 seconds · Calibrating gaze…"
    : "Starting nazar in 3 seconds…");
  syncControlButtons();
}

function finishNazarCountdown(now) {
  countdownActive = false;

  if (countdownCalibrating) {
    const fitResult = createCalibrationFromBaseline(countdownSamples);
    if (fitResult.ok) {
      calibrationSamples = fitResult.samples;
      model = fitResult.model;
      saveTrainingData(calibrationSamples);
      clearTrainingButton.hidden = false;
      trainingStorageWarning = "";
    }
  }

  if (countdownNumber) {
    countdownNumber.textContent = "BURN!";
    countdownNumber.classList.remove("pulse");
    void countdownNumber.offsetWidth;
    countdownNumber.classList.add("pulse");
  }
  if (countdownHint) {
    countdownHint.textContent = "Incinerating toxic energy…";
  }

  setTimeout(() => {
    if (nazarCountdown && !countdownActive) {
      nazarCountdown.hidden = true;
      nazarCountdown.setAttribute("hidden", "");
      nazarCountdown.style.display = "none";
    }
  }, 350);

  phase = "burning";
  hasStartedBurning = true;
  lastBurnAt = now;
  unburnedGazeElapsed = 0;
  autoRecalibrateCooldownUntil = now + AUTO_RECALIBRATE_COOLDOWN_MS;

  if (renderer) {
    renderer.startContinuousBurn(now);
    renderer.igniteEyes();
  }
  playBurnAudio();

  gazeStatus.textContent = "BURNING";
  burnHint.textContent = "Look to burn";
  setStatus("Nazar burning! Look across the photo to burn it to ash.", "success");
  syncControlButtons();
}

function fail(message) {
  phase = "error";
  cancelNazarCountdown();
  clearCalibration();
  stopTracks();
  closeLandmarker();
  setStatus(message, "error");
  retryButton.textContent = model ? "Start burning" : "Retry calibration";
  retryButton.hidden = false;
  startButton.hidden = true;
  stopButton.hidden = true;
  if (uploadControl) uploadControl.hidden = true;
  gazeStatus.textContent = model ? "SAVED CALIBRATION" : "CALIBRATION NEEDED";
  syncControlButtons();
}

async function createLandmarker() {
  const { FaceLandmarker, FilesetResolver } = await import(VISION_MODULE);
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm",
  );
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: "VIDEO",
    numFaces: 1,
    minFaceDetectionConfidence: 0.55,
    minFacePresenceConfidence: 0.55,
    minTrackingConfidence: 0.55,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
}

async function beginCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    fail("Camera access requires HTTPS or localhost in a supported browser.");
    return;
  }
  startButton.disabled = true;
  setStatus("Requesting camera access…");
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    });
    camera.srcObject = stream;
    await camera.play();
    cameraCard.dataset.active = "true";
    cameraPlaceholder.hidden = true;
    cameraState.textContent = "CAMERA ON";
    setStatus("Loading the on-device face landmark model…");
    if (!landmarker) landmarker = await createLandmarker();
    startButton.hidden = true;
    retryButton.hidden = true;
    stopButton.hidden = false;
    if (renderer?.image) {
      if (uploadControl) uploadControl.hidden = false;
      startNazarCountdown();
    } else {
      if (model) {
        phase = getImagePhase(true, true);
        if (uploadControl) uploadControl.hidden = false;
        retryButton.textContent = "Recalibrate";
        retryButton.hidden = false;
        gazeStatus.textContent = "SAVED CALIBRATION";
        setStatus("Saved calibration ready. Choose a photo to put nazar.", "success");
      } else {
        phase = "camera-ready";
        if (uploadControl) uploadControl.hidden = true;
        gazeStatus.textContent = "CALIBRATION NEEDED";
        setStatus("Camera ready. Choose a photo to put nazar.");
      }
    }
    syncControlButtons();
  } catch (error) {
    stopTracks();
    const message = error?.name === "NotAllowedError"
      ? "Camera permission was denied. Allow camera access in your browser settings, then retry."
      : error?.name === "NotFoundError"
        ? "No camera was found. Connect a webcam and retry."
        : `Could not start gaze tracking: ${error?.message || "unknown error"}. Check your connection and camera, then retry.`;
    fail(message);
  } finally {
    startButton.disabled = false;
  }
}

function beginCalibration() {
  if (!landmarker || !stream) {
    setStatus("Start the camera before calibrating.", "error");
    return;
  }
  if (!renderer?.image) {
    setStatus("Choose an image before starting gaze calibration.", "error");
    return;
  }
  phase = "calibrating";
  syncControlButtons();
  targetIndex = 0;
  targetSamples = [];
  pendingCalibrationSamples = [];
  targetStartedAt = performance.now();
  smoothedPoint = null;
  startButton.hidden = true;
  if (uploadControl) uploadControl.hidden = true;
  retryButton.hidden = true;
  calibrationPanel.hidden = false;
  calibrationInstructions.hidden = false;
  calibrationTitle.textContent = "Look at the glowing tile.";
  calibrationHint.textContent = "Keep your face centered, move only your eyes, and hold your gaze on the tile.";
  calibrationCount.textContent = `01 / ${String(ALL_TRAINING_POINTS.length).padStart(2, "0")}`;
  calibrationTarget.dataset.pulse = "true";
  setTargetPosition();
  setStatus("Calibration started · follow each point");
  gazeCursor.style.display = "none";
  calibrationTimeout = setTimeout(() => {
    if (phase === "calibrating") fail("We couldn't get steady eye readings. Improve the lighting, face the camera, and retry.");
  }, 60000);
}

function beginQuickCalibration(trigger = "auto") {
  if (phase !== "burning" || !model || !landmarker || !stream || !renderer || renderer.complete) {
    if (trigger === "manual") {
      setStatus("Quick recalibration needs an active camera and an image with saved training.", "error");
    }
    return;
  }
  const targets = renderer.getVisibleCalibrationTargets(
    QUICK_CALIBRATION_POINT_COUNT,
    calibrationSamples.map((sample) => sample.target),
  );
  if (targets.length === 0) {
    unburnedGazeElapsed = 0;
    autoRecalibrateCooldownUntil = performance.now() + AUTO_RECALIBRATE_COOLDOWN_MS;
    if (trigger === "manual") {
      setStatus("There isn't enough unburned image area for quick recalibration.", "error");
    }
    return;
  }

  quickCalibrationTargets = targets.map((target, index) => ({
    ...target,
    targetIndex: CALIBRATION_POINTS.length + index,
  }));
  phase = "quick-calibrating";
  syncControlButtons();
  targetIndex = 0;
  targetSamples = [];
  pendingCalibrationSamples = [];
  targetStartedAt = performance.now();
  smoothedPoint = null;
  dwell.reset();
  unburnedGazeElapsed = 0;
  calibrationPanel.hidden = false;
  calibrationInstructions.hidden = false;
  if (uploadControl) uploadControl.hidden = true;
  if (trigger === "burnt") {
    calibrationTitle.textContent = "Recalibrating drift…";
    calibrationHint.textContent = "Gaze landed on an already burnt area. Look at each glowing tile to refocus tracking.";
    setStatus(`Gaze landed on already burnt area · auto-recalibrating on ${quickCalibrationTargets.length} unburned ${quickCalibrationTargets.length === 1 ? "spot" : "spots"}.`);
  } else {
    calibrationTitle.textContent = "Auto-recalibrating tracking…";
    calibrationHint.textContent = "Hold your gaze on each glowing tile to fine-tune tracking.";
    setStatus(`Auto-recalibrating: look at ${quickCalibrationTargets.length} unburned ${quickCalibrationTargets.length === 1 ? "spot" : "spots"}.`);
  }
  calibrationCount.textContent = `01 / ${String(quickCalibrationTargets.length).padStart(2, "0")}`;
  calibrationTarget.dataset.pulse = "true";
  setTargetPosition();
  gazeCursor.style.display = "none";
  calibrationTimeout = setTimeout(() => {
    if (phase === "quick-calibrating") {
      cancelQuickCalibration("Auto-recalibration timed out. Your previous calibration is still active.");
    }
  }, 30000);
}

function cancelQuickCalibration(message) {
  clearTimeout(calibrationTimeout);
  phase = getImagePhase(Boolean(model), Boolean(stream));
  quickCalibrationTargets = null;
  targetSamples = [];
  pendingCalibrationSamples = [];
  calibrationPanel.hidden = true;
  calibrationInstructions.hidden = true;
  if (uploadControl) uploadControl.hidden = false;
  calibrationTarget.dataset.pulse = "false";
  retryButton.textContent = "Recalibrate";
  retryButton.hidden = false;
  smoothedPoint = null;
  gazeCursor.dataset.burning = "false";
  dwell.reset();
  unburnedGazeElapsed = 0;
  autoRecalibrateCooldownUntil = performance.now() + AUTO_RECALIBRATE_COOLDOWN_MS;
  if (hasStartedBurning && phase === "burning") {
    if (renderer) renderer.startContinuousBurn();
    playBurnAudio();
  }
  setStatus(message, "error");
  syncControlButtons();
}

function nextCalibrationTarget() {
  const quick = phase === "quick-calibrating";
  const targets = quick ? quickCalibrationTargets : ALL_TRAINING_POINTS;
  if (!targets) return;
  pendingCalibrationSamples.push(...targetSamples);
  targetIndex += 1;
  targetSamples = [];
  targetStartedAt = performance.now();
  if (targetIndex >= targets.length) {
    const baseSamples = quick
      ? calibrationSamples.filter((sample) => sample.targetIndex < ALL_TRAINING_POINTS.length)
      : [];
    const candidateSamples = [...baseSamples, ...pendingCalibrationSamples];
    const result = fitCalibration(candidateSamples, { useExpansion: true });
    clearTimeout(calibrationTimeout);
    if (!result.ok || result.rmse > MAX_CALIBRATION_RMSE) {
      phase = getImagePhase(Boolean(model), Boolean(stream));
      calibrationPanel.hidden = true;
      calibrationInstructions.hidden = true;
      calibrationTarget.dataset.pulse = "false";
      quickCalibrationTargets = null;
      smoothedPoint = null;
      gazeCursor.dataset.burning = "false";
      if (uploadControl) uploadControl.hidden = !model;
      retryButton.textContent = model ? "Recalibrate" : "Retry calibration";
      retryButton.hidden = false;
      unburnedGazeElapsed = 0;
      autoRecalibrateCooldownUntil = performance.now() + AUTO_RECALIBRATE_COOLDOWN_MS;
      const failureMessage = result.ok
        ? "Calibration was inconsistent. Keep your face centered, then retry."
        : result.reason;
      setStatus(quick
        ? `${failureMessage} Your previous calibration is still active.`
        : model ? `${failureMessage} Your saved calibration is still available.` : failureMessage, "error");
      syncControlButtons();
      return;
    }
    calibrationSamples = aggregateCalibrationSamples(candidateSamples);
    model = result.model;
    clearTrainingButton.hidden = false;
    phase = getImagePhase(true, Boolean(stream));
    quickCalibrationTargets = null;
    smoothedPoint = null;
    gazeCursor.dataset.burning = "false";
    calibrationPanel.hidden = true;
    calibrationInstructions.hidden = true;
    calibrationTarget.dataset.pulse = "false";
    retryButton.hidden = true;
    unburnedGazeElapsed = 0;
    autoRecalibrateCooldownUntil = performance.now() + AUTO_RECALIBRATE_COOLDOWN_MS;
    lastBurnAt = performance.now();
    gazeStatus.textContent = "READY";
    if (hasStartedBurning && phase === "burning") {
      if (renderer) renderer.startContinuousBurn();
      playBurnAudio();
    }
    const successMessage = quick
      ? "Error corrections applied · look to burn"
      : "Calibration & error corrections complete · look to burn";
    setStatus(saveTrainingData(calibrationSamples)
      ? successMessage
      : `${successMessage} ${trainingStorageWarning}`, trainingStorageWarning ? "error" : "success");
    startButton.hidden = true;
    retryButton.textContent = "Recalibrate";
    retryButton.hidden = false;
    if (uploadControl) uploadControl.hidden = false;
    burnStatus.textContent = "";
    burnHint.textContent = "Look to burn";
    syncControlButtons();
    return;
  }
  if (!quick && targetIndex >= CALIBRATION_POINTS.length) {
    setStatus("Fine-tuning error correction points…");
  }
  calibrationCount.textContent = `${String(targetIndex + 1).padStart(2, "0")} / ${String(targets.length).padStart(2, "0")}`;
  setTargetPosition();
}

function acceptImage(image, { demo = false } = {}) {
  const shouldStartCalibration = demo && phase === "camera-ready";
  clearTimeout(calibrationTimeout);
  hasStartedBurning = false;
  stopBurnAudio();
  calibrationPanel.hidden = true;
  calibrationInstructions.hidden = true;
  targetSamples = [];
  pendingCalibrationSamples = [];
  if (renderer) renderer.destroy();
  renderer = new BurnRenderer(photoCanvas, flameCanvas, burnStage);
  renderer.onClimacticFlash = () => {
    soundEngine.triggerClimacticFlash();
  };
  renderer.load(image);
  if (deskImg.complete && deskImg.naturalWidth) {
    renderer.loadDeskImage(deskImg);
  }
  currentImageIsDemo = demo;
  if (welcomeModal) {
    welcomeModal.hidden = true;
    welcomeModal.setAttribute("hidden", "");
    welcomeModal.style.display = "none";
  }
  stageEmpty.hidden = true;
  completeMessage.hidden = true;
  completeMessage.setAttribute("hidden", "");
  completeMessage.style.display = "none";
  cancelNazarCountdown();
  phase = getImagePhase(Boolean(model), Boolean(stream));
  if (uploadControl) uploadControl.hidden = phase === "calibrating";
  dwell.reset();
  unburnedGazeElapsed = 0;
  autoRecalibrateCooldownUntil = performance.now() + 4000;
  lastBurnAt = performance.now();
  if (stream && landmarker) {
    startButton.hidden = true;
    startNazarCountdown();
  } else {
    startButton.hidden = false;
    startButton.textContent = "Start burning";
    gazeStatus.textContent = model ? "READY" : "WAITING";
    burnStatus.textContent = "";
    burnHint.textContent = "Start burning";
    setStatus(model
      ? "Photo ready · click Start burning to begin."
      : "Photo ready · click Start burning to calibrate & begin.");
  }
  syncControlButtons();
}

function loadImageSource(source, options = {}) {
  const image = new Image();
  image.onload = () => acceptImage(image, options);
  image.onerror = () => {
    releasePhotoUrl();
    setStatus("That image could not be opened. Try a different photo.", "error");
  };
  image.src = source;
}

function loadLocalFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    setStatus("Choose a supported image file.", "error");
    return;
  }
  releasePhotoUrl();
  photoUrl = URL.createObjectURL(file);
  photoFile.value = "";
  loadImageSource(photoUrl, { demo: false });
}

photoFile.addEventListener("change", () => loadLocalFile(photoFile.files?.[0]));

burnStage.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

burnStage.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    loadLocalFile(file);
    if (!stream || !landmarker) void beginCamera();
  }
});
quickCalibrationButton.addEventListener("click", () => beginQuickCalibration("manual"));

function loadSamplePhoto() {
  if (welcomeModal) {
    welcomeModal.hidden = true;
    welcomeModal.setAttribute("hidden", "");
    welcomeModal.style.display = "none";
  }
  loadImageSource("./assets/portrait-demo.jpg", { demo: true });
  if (!stream || !landmarker) {
    void beginCamera();
  }
}

if (trySamplesButton) trySamplesButton.addEventListener("click", loadSamplePhoto);
if (completeSamplesButton) completeSamplesButton.addEventListener("click", loadSamplePhoto);

function restartBurn() {
  cancelNazarCountdown();
  hasStartedBurning = false;
  stopBurnAudio();
  photoFile.value = "";
  if (renderer?.image) {
    acceptImage(renderer.image, { demo: currentImageIsDemo });
    if (!stream || !landmarker) {
      void beginCamera();
    }
  } else {
    if (welcomeModal) {
      welcomeModal.hidden = false;
      welcomeModal.removeAttribute("hidden");
      welcomeModal.style.display = "flex";
    }
    stageEmpty.hidden = true;
    completeMessage.hidden = true;
    completeMessage.setAttribute("hidden", "");
    completeMessage.style.display = "none";
    phase = "image-ready";
  }
  syncControlButtons();
}

if (burnAgainButton) burnAgainButton.addEventListener("click", restartBurn);
if (restartBurnButton) restartBurnButton.addEventListener("click", restartBurn);
startButton.addEventListener("click", async () => {
  if (!stream || !landmarker) {
    await beginCamera();
  }
  if (renderer?.image && stream && landmarker) {
    startNazarCountdown();
  }
});
clearTrainingButton.addEventListener("click", () => {
  try {
    localStorage.removeItem(TRAINING_STORAGE_KEY);
    localStorage.removeItem(LEGACY_TRAINING_STORAGE_KEY);
    calibrationSamples = [];
    model = null;
    trainingStorageWarning = "";
    hasStoredTraining = false;
    clearTrainingButton.hidden = true;
    unburnedGazeElapsed = 0;
    autoRecalibrateCooldownUntil = 0;
    cancelNazarCountdown();
    if (renderer?.image) {
      phase = "image-ready";
      if (uploadControl) uploadControl.hidden = true;
      startButton.hidden = false;
      startButton.textContent = "Start burning";
      retryButton.hidden = true;
      renderer.load(renderer.image);
      gazeStatus.textContent = "CALIBRATION NEEDED";
      burnStatus.textContent = "";
      burnHint.textContent = "Calibration cleared · next nazar will calibrate";
    }
    syncControlButtons();
    setStatus("Saved training cleared. Next nazar will calibrate gaze.", "success");
  } catch (error) {
    setStatus(`Saved gaze training couldn't be cleared: ${error?.message || "browser storage is unavailable"}.`, "error");
  }
});
retryButton.addEventListener("click", () => {
  if (landmarker && stream) {
    startNazarCountdown({ forceRecalibrate: true });
  } else {
    cancelNazarCountdown();
    clearCalibration();
    startButton.hidden = false;
    retryButton.hidden = true;
    void beginCamera().then(() => {
      if (renderer?.image && stream && landmarker) {
        startNazarCountdown({ forceRecalibrate: true });
      }
    });
  }
});
stopButton.addEventListener("click", () => {
  cancelNazarCountdown();
  clearCalibration();
  hasStartedBurning = false;
  stopBurnAudio();
  stopTracks();
  closeLandmarker();
  unburnedGazeElapsed = 0;
  autoRecalibrateCooldownUntil = 0;
  if (renderer) renderer.destroy();
  renderer = null;
  for (const canvas of [photoCanvas, flameCanvas]) {
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }
  stageEmpty.hidden = false;
  completeMessage.hidden = true;
  completeMessage.style.display = "none";
  if (uploadControl) uploadControl.hidden = true;
  startButton.hidden = false;
  retryButton.hidden = true;
  stopButton.hidden = true;
  phase = "idle";
  syncControlButtons();
  releasePhotoUrl();
  photoFile.value = "";
  setStatus("Camera stopped. Demo image restored.");
  loadImageSource("./assets/portrait-demo.jpg", { demo: true });
});

function updateGaze(features) {
  if (!model) return null;
  const normalized = predictGaze(model, features);
  if (!normalized) return null;
  const stageRect = burnStage.getBoundingClientRect();
  const imageRect = renderer?.imageRect;
  if (!imageRect) return null;
  const point = mapGazeToRect(normalized, {
    left: stageRect.left + imageRect.x,
    top: stageRect.top + imageRect.y,
    width: imageRect.width,
    height: imageRect.height,
  });
  if (!point) return null;
  const clamped = {
    x: Math.max(stageRect.left + imageRect.x, Math.min(stageRect.left + imageRect.x + imageRect.width, point.x)),
    y: Math.max(stageRect.top + imageRect.y, Math.min(stageRect.top + imageRect.y + imageRect.height, point.y)),
  };

  // Micro-saccadic damping / magnetic dwell lock:
  // Human eyes naturally experience micro-saccades (30-80 Hz).
  // When dwelling on a spot, apply subtle attraction toward the dwell anchor to prevent saccade breakups.
  if (phase === "burning" && dwell.anchor) {
    const anchorStageX = stageRect.left + dwell.anchor.x;
    const anchorStageY = stageRect.top + dwell.anchor.y;
    const distToAnchor = Math.hypot(clamped.x - anchorStageX, clamped.y - anchorStageY);
    if (distToAnchor > 0 && distToAnchor < dwell.radius) {
      const attraction = 0.20 * (1 - distToAnchor / dwell.radius);
      clamped.x += (anchorStageX - clamped.x) * attraction;
      clamped.y += (anchorStageY - clamped.y) * attraction;
    }
  }

  if (smoothedPoint) {
    const dist = Math.hypot(clamped.x - smoothedPoint.x, clamped.y - smoothedPoint.y);
    const alpha = Math.min(0.80, Math.max(0.32, 0.80 - (dist / 80) * 0.48));
    smoothedPoint = {
      x: smoothedPoint.x * alpha + clamped.x * (1 - alpha),
      y: smoothedPoint.y * alpha + clamped.y * (1 - alpha),
    };
  } else {
    smoothedPoint = clamped;
  }
  gazeCursor.style.left = `${smoothedPoint.x}px`;
  gazeCursor.style.top = `${smoothedPoint.y}px`;
  gazeCursor.style.display = !countdownActive && (phase === "calibrated" || phase === "burning") ? "block" : "none";
  return smoothedPoint;
}

function collectCalibrationSample(features, now) {
  const elapsed = now - targetStartedAt;
  if (!isCalibrationPointSettled(elapsed)) {
    return;
  }
  const quick = phase === "quick-calibrating";
  const targets = quick ? quickCalibrationTargets : ALL_TRAINING_POINTS;
  const target = targets?.[targetIndex];
  if (!target) return;
  targetSamples.push({
    features,
    target: { x: target.x, y: target.y },
    targetIndex: quick ? target.targetIndex : targetIndex,
  });
  // Fast, snappy calibration transition as soon as 12 steady samples are collected
  if (elapsed >= 550 && targetSamples.length >= 12) nextCalibrationTarget();
}

function processFrame(now) {
  if (stream && landmarker && camera.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && now - lastDetectionAt >= 55) {
    const deltaMs = lastDetectionAt ? Math.min(now - lastDetectionAt, 250) : 55;
    lastDetectionAt = now;
    try {
      const results = landmarker.detectForVideo(camera, now);
      const features = extractGazeFeatures(results.faceLandmarks?.[0]);
      if (features) {
        if (countdownActive && countdownCalibrating) {
          countdownSamples.push({ features, time: now });
        }
        if (phase === "calibrating" || phase === "quick-calibrating") {
          collectCalibrationSample(features, now);
        }
        const point = updateGaze(features);
        if (phase === "burning" && renderer && point) {
          const stageRect = burnStage.getBoundingClientRect();
          const local = { x: point.x - stageRect.left, y: point.y - stageRect.top };
          let burningNow = false;
          let isLookingAtBurnt = false;
          if (renderer.contains(local.x, local.y)) {
            const isBurnt = renderer.isBurnedAt(local.x, local.y);
            const result = dwell.observe(local, now);
            if (isBurnt) {
              gazeCursor.dataset.burning = "false";
              gazeCursor.dataset.charging = "false";
              gazeCursor.style.setProperty("--charge", "0");
              isLookingAtBurnt = isTryingToLookAtBurnt({ isBurnt, dwellActive: result.active });
            } else {
              const shouldBurn = hasStartedBurning || result.active;
              gazeCursor.dataset.burning = String(shouldBurn);
              if (result.progress > 0 && !shouldBurn) {
                gazeCursor.dataset.charging = "true";
                gazeCursor.style.setProperty("--charge", result.progress.toFixed(3));
              } else if (shouldBurn) {
                gazeCursor.dataset.charging = "false";
                gazeCursor.style.setProperty("--charge", "1");
              } else {
                gazeCursor.dataset.charging = "false";
                gazeCursor.style.setProperty("--charge", "0");
              }
              if (shouldBurn) {
                if (!hasStartedBurning) {
                  hasStartedBurning = true;
                  renderer.startContinuousBurn();
                  playBurnAudio();
                } else if (!soundEngine.isPlaying && !soundEngine.muted) {
                  playBurnAudio();
                }
                burningNow = true;
                unburnedGazeElapsed = 0;

                // Keep burning slow and deliberate: steady 180ms interval with organic burn radius
                if (now - lastBurnAt >= 180) {
                  lastBurnAt = now;
                  const radius = 16 + (result.progress || 0.3) * 14;
                  renderer.eraseAt(local.x, local.y, radius);
                  renderer.emit(local.x, local.y, now);
                }
              }
            }
          } else {
            dwell.reset();
            gazeCursor.dataset.burning = "false";
            gazeCursor.dataset.charging = "false";
            gazeCursor.style.setProperty("--charge", "0");
          }
          if (!burningNow && !hasStartedBurning) {
            unburnedGazeElapsed += deltaMs;
            if (shouldTriggerAutoRecalibration({
              phase,
              hasModel: Boolean(model),
              hasStream: Boolean(stream),
              hasActiveGaze: true,
              unburnedGazeElapsed,
              stallThresholdMs: AUTO_RECALIBRATE_STALL_MS,
              isComplete: renderer.complete || renderer.burnedFraction >= 0.96,
              cooldownUntil: autoRecalibrateCooldownUntil,
              now,
              isLookingAtBurnt,
            })) {
              beginQuickCalibration(isLookingAtBurnt ? "burnt" : "auto");
            }
          } else if (isLookingAtBurnt) {
            if (shouldTriggerAutoRecalibration({
              phase,
              hasModel: Boolean(model),
              hasStream: Boolean(stream),
              hasActiveGaze: true,
              unburnedGazeElapsed,
              stallThresholdMs: AUTO_RECALIBRATE_STALL_MS,
              isComplete: renderer.complete || renderer.burnedFraction >= 0.96,
              cooldownUntil: autoRecalibrateCooldownUntil,
              now,
              isLookingAtBurnt: true,
            })) {
              beginQuickCalibration("burnt");
            }
          }
        } else {
          gazeCursor.dataset.burning = "false";
          gazeCursor.dataset.charging = "false";
          gazeCursor.style.setProperty("--charge", "0");
          if (phase === "burning" && !hasStartedBurning) {
            unburnedGazeElapsed += deltaMs;
            if (shouldTriggerAutoRecalibration({
              phase,
              hasModel: Boolean(model),
              hasStream: Boolean(stream),
              hasActiveGaze: true,
              unburnedGazeElapsed,
              stallThresholdMs: AUTO_RECALIBRATE_STALL_MS,
              isComplete: renderer ? (renderer.complete || renderer.burnedFraction >= 0.96) : false,
              cooldownUntil: autoRecalibrateCooldownUntil,
              now,
            })) {
              beginQuickCalibration("auto");
            }
          }
        }
      } else {
        unburnedGazeElapsed = 0;
        if (phase === "burning") {
          dwell.reset();
          gazeCursor.dataset.burning = "false";
          gazeCursor.dataset.charging = "false";
          gazeCursor.style.setProperty("--charge", "0");
        }
      }
    } catch (error) {
      fail(`Gaze tracking stopped: ${error?.message || "camera frame could not be read"}. Please retry.`);
    }
  }

  if (countdownActive) {
    const elapsed = now - countdownStart;
    const remainingMs = Math.max(0, COUNTDOWN_DURATION_MS - elapsed);
    const remainingSec = Math.ceil(remainingMs / 1000);
    const progress = Math.min(1, elapsed / COUNTDOWN_DURATION_MS);
    const circumference = 326.73;
    if (countdownProgress) {
      countdownProgress.style.strokeDashoffset = String(circumference * progress);
    }
    if (remainingSec !== countdownLastSecond) {
      countdownLastSecond = remainingSec;
      if (remainingSec > 0 && countdownNumber) {
        countdownNumber.textContent = String(remainingSec);
        countdownNumber.classList.remove("pulse");
        void countdownNumber.offsetWidth;
        countdownNumber.classList.add("pulse");
        setStatus(countdownCalibrating
          ? `Starting nazar in ${remainingSec}… · Calibrating gaze`
          : `Starting nazar in ${remainingSec}…`);
      }
    }
    if (elapsed >= COUNTDOWN_DURATION_MS) {
      finishNazarCountdown(now);
    }
  }

  if (renderer && (phase === "burning" || phase === "ash" || phase === "quick-calibrating" || (phase === "calibrating" && hasStartedBurning) || hasStartedBurning || countdownActive)) {
    if (hasStartedBurning && renderer.burningActive) {
      renderer.stepContinuousBurn(now);
      const fireCount = renderer.thermoEngine?.activeBurningCount || 40;
      soundEngine.updateBurnIntensity(fireCount);
    }
    if (now - lastFrameAt > 25) {
      renderer.render(now);
      lastFrameAt = now;
    }
    if (((renderer.checkCompletion(now) || (renderer.complete && phase !== "complete" && phase !== "ash")) || renderer.burnedFraction >= 0.98) && phase !== "ash" && phase !== "complete") {
      phase = "ash";
      hasStartedBurning = false;
      soundEngine.updateBurnIntensity(0);
      stopBurnAudio({ fade: true });
      dwell.reset();
      renderer.complete = true;
      renderer.burnedFraction = 1;
      renderer.clearFlames();
      renderer.render(now);
      completeMessage.hidden = true;
      completeMessage.setAttribute("hidden", "");
      completeMessage.style.display = "none";
      calibrationPanel.hidden = true;
      calibrationInstructions.hidden = true;
      clearTimeout(calibrationTimeout);
      clearTimeout(ashTimeout);
      gazeStatus.textContent = "ASH";
      burnHint.textContent = "Only ash remains";
      gazeCursor.dataset.burning = "false";
      gazeCursor.dataset.charging = "false";
      gazeCursor.style.setProperty("--charge", "0");
      gazeCursor.style.display = "none";
      syncControlButtons();
      setStatus("Reduced to cold ash…", "success");

      ashTimeout = setTimeout(() => {
        if (phase === "ash") {
          phase = "complete";
          completeMessage.hidden = false;
          completeMessage.removeAttribute("hidden");
          completeMessage.style.display = "flex";
          burnAgainButton?.focus();
          gazeStatus.textContent = "ASHES";
          burnHint.textContent = "Lost to time";
          syncControlButtons();
          setStatus("Only cold ash remains. What was once there is gone forever.", "success");
        }
      }, 2000);
    }
  }
  animationFrame = requestAnimationFrame(processFrame);
}

function handlePageExit() {
  clearTimeout(calibrationTimeout);
  cancelNazarCountdown();
  hasStartedBurning = false;
  stopBurnAudio();
  stopAnimation();
  stopTracks();
  releasePhotoUrl();
  if (landmarker) {
    void landmarker.close();
    landmarker = null;
  }
  if (renderer) renderer.destroy();
}

window.addEventListener("pagehide", handlePageExit);
window.addEventListener("resize", () => {
  if (phase === "calibrating" || phase === "quick-calibrating") {
    targetSamples = [];
    targetStartedAt = performance.now();
    setTargetPosition();
  }
});
const urlParams = new URLSearchParams(window.location.search);
const burnTarget = urlParams.get("burn");
const entityName = urlParams.get("name") || urlParams.get("target") || urlParams.get("master");

if (burnTarget) {
  if (welcomeModal) {
    welcomeModal.hidden = true;
    welcomeModal.setAttribute("hidden", "");
    welcomeModal.style.display = "none";
  }
  loadImageSource(burnTarget, { demo: false });
  setStatus(`${entityName ? entityName : "Occult Entity"} loaded · Click Start burning to lock eyes and incinerate.`, "success");
} else {
  // Initial on-load state: Show the two options (Upload photo / Try samples)
  if (welcomeModal) {
    welcomeModal.hidden = false;
    welcomeModal.removeAttribute("hidden");
    welcomeModal.style.display = "flex";
  }
  stageEmpty.hidden = true;
  startButton.hidden = true;
  gazeStatus.textContent = "WAITING";
  burnHint.textContent = "";
  setStatus("Choose an option to begin: upload a photo of person to put nazar, or try samples.");
}

animationFrame = requestAnimationFrame(processFrame);
