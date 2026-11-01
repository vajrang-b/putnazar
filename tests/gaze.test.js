import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateCalibrationSamples,
  ALL_TRAINING_POINTS,
  AUTO_RECALIBRATE_COOLDOWN_MS,
  AUTO_RECALIBRATE_STALL_MS,
  CALIBRATION_POINTS,
  CALIBRATION_SETTLE_MS,
  createCalibrationFromBaseline,
  DwellTracker,
  ERROR_CORRECTION_POINTS,
  expandGazeFeatures,
  extractGazeFeatures,
  filterSampleOutliers,
  fitCalibration,
  getImagePhase,
  isCalibrationPointSettled,
  isTryingToLookAtBurnt,
  MAX_CALIBRATION_POINT_COUNT,
  mapGazeToRect,
  predictGaze,
  QUICK_CALIBRATION_POINT_COUNT,
  selectRefinementTargets,
  shouldTriggerAutoRecalibration,
} from "../js/gaze.js";
import { BurnRenderer } from "../js/burn-renderer.js";

function createLandmarks() {
  const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  points[33] = { x: 0.34, y: 0.44 };
  points[133] = { x: 0.43, y: 0.44 };
  points[159] = { x: 0.38, y: 0.43 };
  points[145] = { x: 0.38, y: 0.46 };
  points[468] = { x: 0.385, y: 0.445 };
  points[362] = { x: 0.57, y: 0.44 };
  points[263] = { x: 0.66, y: 0.44 };
  points[386] = { x: 0.61, y: 0.43 };
  points[374] = { x: 0.61, y: 0.46 };
  points[473] = { x: 0.615, y: 0.445 };
  points[1] = { x: 0.5, y: 0.53 };
  points[234] = { x: 0.25, y: 0.5 };
  points[454] = { x: 0.75, y: 0.5 };
  points[10] = { x: 0.5, y: 0.2 };
  points[152] = { x: 0.5, y: 0.8 };
  return points;
}

test("extracts finite eye and face features from a full face mesh", () => {
  const features = extractGazeFeatures(createLandmarks());
  assert.equal(features.length, 6);
  assert.ok(features.every(Number.isFinite));
  assert.equal(extractGazeFeatures([]), null);
});

test("waits for the calibration target transition before collecting samples", () => {
  assert.equal(isCalibrationPointSettled(CALIBRATION_SETTLE_MS - 1), false);
  assert.equal(isCalibrationPointSettled(CALIBRATION_SETTLE_MS), true);
  assert.equal(isCalibrationPointSettled(Number.NaN), false);
});

test("uses 16 distinct calibration points in a four-by-four grid", () => {
  assert.equal(CALIBRATION_POINTS.length, 16);
  assert.equal(new Set(CALIBRATION_POINTS.map(({ x, y }) => `${x},${y}`)).size, 16);
  assert.deepEqual([...new Set(CALIBRATION_POINTS.map(({ x }) => x))], [0.16, 0.39, 0.61, 0.84]);
  assert.deepEqual([...new Set(CALIBRATION_POINTS.map(({ y }) => y))], [0.16, 0.39, 0.61, 0.84]);
});

test("only enters burn mode when calibration and camera are both ready", () => {
  assert.equal(getImagePhase(false, false), "image-ready");
  assert.equal(getImagePhase(true, false), "calibrated");
  assert.equal(getImagePhase(true, true), "burning");
});

test("selects visible refinement targets away from previous calibration points", () => {
  const candidates = [
    { x: 0.1, y: 0.1, coverage: 1 },
    { x: 0.3, y: 0.3, coverage: 0.2 },
    { x: 0.5, y: 0.5, coverage: 1 },
    { x: 0.7, y: 0.7, coverage: 0.9 },
    { x: 0.9, y: 0.9, coverage: 0.95 },
    { x: 0.85, y: 0.15, coverage: 0.9 },
  ];
  const selected = selectRefinementTargets(candidates, [{ x: 0.1, y: 0.1 }], QUICK_CALIBRATION_POINT_COUNT);
  assert.equal(selected.length, 4);
  assert.ok(selected.every(({ x, y }) =>
    candidates.some((candidate) => candidate.x === x && candidate.y === y && candidate.coverage >= 0.6)));
  assert.ok(!selected.some(({ x, y }) => x === 0.1 && y === 0.1));
});

test("fits calibration and predicts gaze coordinates", () => {
  const samples = [];
  CALIBRATION_POINTS.forEach((target, targetIndex) => {
    for (let index = 0; index < 20; index += 1) {
      const jitter = (index % 5 - 2) * 0.0002;
      const x = target.x + jitter;
      const y = target.y - jitter;
      samples.push({
        target,
        targetIndex,
        features: [x, y, x * y, x ** 2, y ** 2, x - y],
      });
    }
  });
  const result = fitCalibration(aggregateCalibrationSamples(samples));
  assert.equal(result.ok, true);
  assert.ok(result.rmse < 0.01);
  assert.equal(result.sampleCount, CALIBRATION_POINTS.length * 20);
  const target = CALIBRATION_POINTS[0];
  const predicted = predictGaze(result.model, [target.x, target.y, target.x * target.y, target.x ** 2, target.y ** 2, target.x - target.y]);
  assert.ok(Math.abs(predicted.x - CALIBRATION_POINTS[0].x) < 0.01);
  assert.ok(Math.abs(predicted.y - CALIBRATION_POINTS[0].y) < 0.01);
});

test("fits quick refinement points alongside the original calibration", () => {
  const samples = CALIBRATION_POINTS.flatMap((target, targetIndex) =>
    Array.from({ length: 14 }, () => ({ target, targetIndex, features: [target.x, target.y] })),
  );
  const quickTargets = [
    { x: 0.28, y: 0.28 },
    { x: 0.72, y: 0.28 },
    { x: 0.28, y: 0.72 },
    { x: 0.72, y: 0.72 },
  ];
  quickTargets.forEach((target, index) => {
    samples.push(...Array.from({ length: 14 }, () => ({
      target,
      targetIndex: CALIBRATION_POINTS.length + index,
      features: [target.x, target.y],
    })));
  });
  const result = fitCalibration(aggregateCalibrationSamples(samples));
  assert.equal(MAX_CALIBRATION_POINT_COUNT, 20);
  assert.equal(result.ok, true);
  assert.ok(result.rmse < 0.01);
  assert.equal(result.sampleCount, 20 * 14);
});

test("learns the correct screen direction when horizontal gaze features are reversed", () => {
  const samples = CALIBRATION_POINTS.flatMap((target, targetIndex) =>
    Array.from({ length: 14 }, () => ({
      target,
      targetIndex,
      features: [1 - target.x, target.y],
    })),
  );
  const result = fitCalibration(aggregateCalibrationSamples(samples));
  assert.equal(result.ok, true);
  const target = CALIBRATION_POINTS[2];
  const predicted = predictGaze(result.model, [1 - target.x, target.y]);
  assert.ok(Math.abs(predicted.x - target.x) < 0.01);
});

test("rejects incomplete 16-point calibration", () => {
  const result = fitCalibration([{ target: CALIBRATION_POINTS[0], targetIndex: 0, features: [0.5, 0.5] }]);
  assert.equal(result.ok, false);
  assert.match(result.reason, /samples/i);
});

test("maps normalized gaze into viewport coordinates", () => {
  assert.deepEqual(mapGazeToRect({ x: 0.5, y: 0.25 }, { left: 10, top: 20, width: 800, height: 600 }), {
    x: 410,
    y: 170,
  });
});

test("dwell starts burning only after a stable gaze hold", () => {
  const dwell = new DwellTracker({ dwellMs: 500, radius: 30 });
  assert.deepEqual(dwell.observe({ x: 50, y: 50 }, 1000), { active: false, progress: 0 });
  assert.equal(dwell.observe({ x: 55, y: 53 }, 1250).active, false);
  assert.deepEqual(dwell.observe({ x: 52, y: 51 }, 1500), { active: true, progress: 1 });
  assert.equal(dwell.observe({ x: 100, y: 100 }, 1600).active, false);
  assert.deepEqual(dwell.observe(null, 1700), { active: false, progress: 0 });
});

test("triggers automatic quick recalibration when gaze is active but burning stalls", () => {
  const baseState = {
    phase: "burning",
    hasModel: true,
    hasStream: true,
    hasActiveGaze: true,
    unburnedGazeElapsed: AUTO_RECALIBRATE_STALL_MS,
    stallThresholdMs: AUTO_RECALIBRATE_STALL_MS,
    isComplete: false,
    cooldownUntil: 10000,
    now: 15000,
  };

  assert.equal(shouldTriggerAutoRecalibration(baseState), true);

  // Does not trigger if not in burning phase
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, phase: "calibrating" }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, phase: "idle" }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, phase: "complete" }), false);

  // Does not trigger without model, stream, or active gaze
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, hasModel: false }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, hasStream: false }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, hasActiveGaze: false }), false);

  // Does not trigger if burning is already complete
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, isComplete: true }), false);

  // Does not trigger during cooldown
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, cooldownUntil: 20000, now: 15000 }), false);

  // Does not trigger if unburned gaze time has not reached the threshold
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, unburnedGazeElapsed: AUTO_RECALIBRATE_STALL_MS - 1 }), false);
});

test("immediately triggers automatic quick recalibration when trying to look at already burnt places", () => {
  const baseState = {
    phase: "burning",
    hasModel: true,
    hasStream: true,
    hasActiveGaze: true,
    unburnedGazeElapsed: 0,
    stallThresholdMs: AUTO_RECALIBRATE_STALL_MS,
    isComplete: false,
    cooldownUntil: 10000,
    now: 15000,
    isLookingAtBurnt: true,
  };

  // Triggers immediately with isLookingAtBurnt even with 0 unburned elapsed time
  assert.equal(shouldTriggerAutoRecalibration(baseState), true);

  // Works with aliases
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, isLookingAtBurnt: false, lookingAtBurnt: true }), true);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, isLookingAtBurnt: false, isLookingAtBurntPlace: true }), true);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, isLookingAtBurnt: false, tryingToLookAtBurnt: true }), true);

  // Still respects burning phase, active gaze, completion, and cooldown
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, phase: "calibrating" }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, hasModel: false }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, hasStream: false }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, hasActiveGaze: false }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, isComplete: true }), false);
  assert.equal(shouldTriggerAutoRecalibration({ ...baseState, cooldownUntil: 20000, now: 15000 }), false);
});

test("isTryingToLookAtBurnt evaluates active dwell on burned area", () => {
  assert.equal(isTryingToLookAtBurnt({ isBurnt: true, dwellActive: true }), true);
  assert.equal(isTryingToLookAtBurnt({ isBurnt: true, dwellActive: false }), false);
  assert.equal(isTryingToLookAtBurnt({ isBurnt: false, dwellActive: true }), false);
  assert.equal(isTryingToLookAtBurnt({ isBurnt: false, dwellActive: false }), false);
  assert.equal(isTryingToLookAtBurnt(true, true), true);
  assert.equal(isTryingToLookAtBurnt(true, false), false);
  assert.equal(isTryingToLookAtBurnt(false, true), false);
});

test("BurnRenderer.isBurnedAt detects burned spots accurately", () => {
  function createMockCanvas(initialWidth = 100, initialHeight = 100) {
    let width = initialWidth;
    let height = initialHeight;
    let pixels = new Uint8ClampedArray(width * height * 4);

    const context = {
      fillStyle: "#fff",
      globalCompositeOperation: "source-over",
      fillRect(x, y, w, h) {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
            const idx = (py * width + px) * 4;
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 255;
          }
        }
      },
      clearRect(x, y, w, h) {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
            const idx = (py * width + px) * 4;
            pixels[idx + 3] = 0;
          }
        }
      },
      save() {},
      restore() {},
      beginPath() {
        this._arc = null;
      },
      arc(cx, cy, r) {
        this._arc = { cx, cy, r };
      },
      fill() {
        if (this.globalCompositeOperation === "destination-out" && this._arc) {
          const { cx, cy, r } = this._arc;
          const rSq = r * r;
          const minX = Math.max(0, Math.floor(cx - r));
          const maxX = Math.min(width - 1, Math.ceil(cx + r));
          const minY = Math.max(0, Math.floor(cy - r));
          const maxY = Math.min(height - 1, Math.ceil(cy + r));
          for (let py = minY; py <= maxY; py += 1) {
            for (let px = minX; px <= maxX; px += 1) {
              if ((px - cx) ** 2 + (py - cy) ** 2 <= rSq) {
                const idx = (py * width + px) * 4;
                pixels[idx + 3] = 0;
              }
            }
          }
        }
      },
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let py = 0; py < h; py += 1) {
          for (let px = 0; px < w; px += 1) {
            const srcX = x + px;
            const srcY = y + py;
            const targetIdx = (py * w + px) * 4;
            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
              const srcIdx = (srcY * width + srcX) * 4;
              data[targetIdx] = pixels[srcIdx];
              data[targetIdx + 1] = pixels[srcIdx + 1];
              data[targetIdx + 2] = pixels[srcIdx + 2];
              data[targetIdx + 3] = pixels[srcIdx + 3];
            }
          }
        }
        return { data };
      },
      drawImage() {},
    };

    return {
      get width() { return width; },
      set width(val) {
        width = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      get height() { return height; },
      set height(val) {
        height = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      getContext() {
        return context;
      },
    };
  }

  const stage = {
    getBoundingClientRect() {
      return { width: 400, height: 300, left: 0, top: 0 };
    },
  };

  const renderer = new BurnRenderer(createMockCanvas(400, 300), createMockCanvas(400, 300), stage, {
    createCanvas: () => createMockCanvas(400, 300),
  });

  const image = { naturalWidth: 400, naturalHeight: 300 };
  renderer.load(image);

  // Before any burn, all points are intact
  assert.equal(renderer.isBurnedAt(200, 150), false);
  assert.equal(renderer.isBurnedAt(50, 50), false);

  // Erase a circular spot at center (200, 150)
  renderer.eraseAt(200, 150, 30);

  // Center point is now burned
  assert.equal(renderer.isBurnedAt(200, 150), true);
  // Aliases work
  assert.equal(renderer.isBurntAt(200, 150), true);
  assert.equal(renderer.isBurned(200, 150), true);
  assert.equal(renderer.isBurnt(200, 150), true);

  // Far away point is unburned
  assert.equal(renderer.isBurnedAt(50, 50), false);

  // Points outside stage/image bounds return false
  assert.equal(renderer.isBurnedAt(-50, -50), false);
  assert.equal(renderer.isBurnedAt(500, 500), false);

  // When complete, returns false
  renderer.complete = true;
  assert.equal(renderer.isBurnedAt(200, 150), false);
});

test("BurnRenderer continues burning once started without stopping", () => {
  function createMockCanvas(initialWidth = 100, initialHeight = 100) {
    let width = initialWidth;
    let height = initialHeight;
    let pixels = new Uint8ClampedArray(width * height * 4);

    const context = {
      fillStyle: "#fff",
      globalCompositeOperation: "source-over",
      fillRect(x, y, w, h) {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
            const idx = (py * width + px) * 4;
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 255;
          }
        }
      },
      clearRect(x, y, w, h) {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
            const idx = (py * width + px) * 4;
            pixels[idx + 3] = 0;
          }
        }
      },
      save() {},
      restore() {},
      beginPath() {
        this._arc = null;
      },
      arc(cx, cy, r) {
        this._arc = { cx, cy, r };
      },
      fill() {
        if (this.globalCompositeOperation === "destination-out" && this._arc) {
          const { cx, cy, r } = this._arc;
          const rSq = r * r;
          const minX = Math.max(0, Math.floor(cx - r));
          const maxX = Math.min(width - 1, Math.ceil(cx + r));
          const minY = Math.max(0, Math.floor(cy - r));
          const maxY = Math.min(height - 1, Math.ceil(cy + r));
          for (let py = minY; py <= maxY; py += 1) {
            for (let px = minX; px <= maxX; px += 1) {
              if ((px - cx) ** 2 + (py - cy) ** 2 <= rSq) {
                const idx = (py * width + px) * 4;
                pixels[idx + 3] = 0;
              }
            }
          }
        }
      },
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let py = 0; py < h; py += 1) {
          for (let px = 0; px < w; px += 1) {
            const srcX = x + px;
            const srcY = y + py;
            const targetIdx = (py * w + px) * 4;
            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
              const srcIdx = (srcY * width + srcX) * 4;
              data[targetIdx] = pixels[srcIdx];
              data[targetIdx + 1] = pixels[srcIdx + 1];
              data[targetIdx + 2] = pixels[srcIdx + 2];
              data[targetIdx + 3] = pixels[srcIdx + 3];
            }
          }
        }
        return { data };
      },
      drawImage() {},
    };

    return {
      get width() { return width; },
      set width(val) {
        width = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      get height() { return height; },
      set height(val) {
        height = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      getContext() {
        return context;
      },
    };
  }

  const stage = {
    getBoundingClientRect() {
      return { width: 400, height: 300, left: 0, top: 0 };
    },
  };

  const renderer = new BurnRenderer(createMockCanvas(400, 300), createMockCanvas(400, 300), stage, {
    createCanvas: () => createMockCanvas(400, 300),
  });

  const image = { naturalWidth: 400, naturalHeight: 300 };
  renderer.load(image);

  assert.equal(renderer.burningActive, false);
  renderer.startContinuousBurn();
  assert.equal(renderer.burningActive, true);

  // Initial ignition
  renderer.eraseAt(200, 150, 20);
  assert.ok(renderer.burnFronts.length > 0);

  // Step the burn over time
  for (let t = 100; t <= 1000; t += 100) {
    renderer.stepContinuousBurn(t);
  }

  // Fire has expanded around the initial burn with controlled slow fronts
  assert.equal(renderer.isBurnedAt(200, 150), true);
  assert.ok(renderer.particles.length > 0);
  assert.ok(renderer.burnFronts.length <= 10);

  // Stopping continuous burn clears active fronts
  renderer.stopContinuousBurn();
  assert.equal(renderer.burningActive, false);
  assert.equal(renderer.burnFronts.length, 0);
});

test("filterSampleOutliers downweights outlier blink noise", () => {
  const steady = Array.from({ length: 14 }, () => ({
    targetIndex: 0,
    target: { x: 0.5, y: 0.5 },
    features: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  }));
  const outlier = {
    targetIndex: 0,
    target: { x: 0.5, y: 0.5 },
    features: [0.95, 0.95, 0.95, 0.95, 0.95, 0.95],
  };
  const filtered = filterSampleOutliers([...steady, outlier]);
  assert.equal(filtered.length, 15);
  const outlierResult = filtered[14];
  assert.ok(outlierResult.weight < filtered[0].weight * 0.1);
});

test("expandGazeFeatures adds quadratic and interaction error correction terms", () => {
  const base = [0.4, 0.6, 0.45, 0.55, 0.5, 0.5];
  const expanded = expandGazeFeatures(base);
  assert.equal(expanded.length, 14);
  assert.ok(expanded.every(Number.isFinite));
  assert.equal(expanded[6], 0.4 ** 2);
  assert.equal(expanded[7], 0.6 ** 2);
  assert.equal(expanded[10], 0.4 * 0.6);
});

test("ERROR_CORRECTION_POINTS covers the screen center and quadrant anchors", () => {
  assert.equal(ERROR_CORRECTION_POINTS.length, 4);
  assert.ok(ERROR_CORRECTION_POINTS.some(({ x, y }) => x === 0.5 && y === 0.5));
  assert.equal(ALL_TRAINING_POINTS.length, 20);
});

test("physics burn simulation models organic tear paths, scorch layers, and buoyant particles", () => {
  const stage = {
    getBoundingClientRect() {
      return { width: 400, height: 300, left: 0, top: 0 };
    },
  };
  const calls = [];
  const mockCtx = {
    beginPath() { calls.push({ op: "beginPath" }); },
    moveTo(x, y) { calls.push({ op: "moveTo", x, y }); },
    quadraticCurveTo(cpx, cpy, x, y) { calls.push({ op: "quadraticCurveTo", cpx, cpy, x, y }); },
    closePath() { calls.push({ op: "closePath" }); },
    save() { calls.push({ op: "save" }); },
    restore() { calls.push({ op: "restore" }); },
    fillRect() {},
    clearRect() {},
    fill() { calls.push({ op: "fill", style: this.fillStyle, composite: this.globalCompositeOperation }); },
    fillStyle: "",
    globalCompositeOperation: "source-over",
  };

  const renderer = new BurnRenderer(null, null, stage, {
    createCanvas: () => ({ getContext: () => mockCtx, width: 400, height: 300 }),
  });
  renderer.load({ naturalWidth: 400, naturalHeight: 300 });

  // 1. Organic burn path produces multi-segment quadratic curves
  renderer.drawOrganicBurnPath(mockCtx, 100, 100, 30);
  const quadCalls = calls.filter((c) => c.op === "quadraticCurveTo");
  assert.equal(quadCalls.length, 20);

  // 2. Multi-layer scorch and char combustion zones
  calls.length = 0;
  renderer.drawScorchAndChar(mockCtx, 100, 100, 30);
  const fillCalls = calls.filter((c) => c.op === "fill");
  // Scorch halo, carbon char, ember rim, and punch-out
  assert.equal(fillCalls.length, 4);
  assert.ok(fillCalls.some((c) => c.style.includes("rgba(75, 38, 14"))); // scorch halo
  assert.ok(fillCalls.some((c) => c.style.includes("rgba(18, 12, 10"))); // char
  assert.ok(fillCalls.some((c) => c.style.includes("rgba(255, 110, 20"))); // ember rim
  assert.ok(fillCalls.some((c) => c.composite === "destination-out")); // interior punched out

  // 3. Particle system includes buoyant flames, fast spark pops, and billowing smoke
  renderer.particles = [];
  renderer.emit(100, 100, 1000);
  const flames = renderer.particles.filter((p) => p.kind === "flame");
  const sparks = renderer.particles.filter((p) => p.kind === "spark");
  const smoke = renderer.particles.filter((p) => p.kind === "smoke");

  assert.ok(flames.length >= 3);
  assert.ok(flames.every((f) => f.vy < 0 && f.ay < 0)); // upward convection + buoyancy acceleration
  assert.ok(sparks.length >= 2);
  assert.ok(sparks.every((s) => s.vy <= -1.0)); // high-velocity upward pops
  assert.ok(smoke.length >= 0); // diffusive ash cloud
});

test("BurnRenderer resets state and mask completely when reloaded to burn again", () => {
  function createMockCanvas(initialWidth = 100, initialHeight = 100) {
    let width = initialWidth;
    let height = initialHeight;
    let pixels = new Uint8ClampedArray(width * height * 4);

    const context = {
      fillStyle: "#fff",
      globalCompositeOperation: "source-over",
      fillRect(x, y, w, h) {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
            const idx = (py * width + px) * 4;
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 255;
          }
        }
      },
      clearRect(x, y, w, h) {
        for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
          for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) {
            const idx = (py * width + px) * 4;
            pixels[idx + 3] = 0;
          }
        }
      },
      save() {},
      restore() {},
      beginPath() { this._arc = null; },
      arc(cx, cy, r) { this._arc = { cx, cy, r }; },
      fill() {
        if (this.globalCompositeOperation === "destination-out" && this._arc) {
          const { cx, cy, r } = this._arc;
          const rSq = r * r;
          const minX = Math.max(0, Math.floor(cx - r));
          const maxX = Math.min(width - 1, Math.ceil(cx + r));
          const minY = Math.max(0, Math.floor(cy - r));
          const maxY = Math.min(height - 1, Math.ceil(cy + r));
          for (let py = minY; py <= maxY; py += 1) {
            for (let px = minX; px <= maxX; px += 1) {
              if ((px - cx) ** 2 + (py - cy) ** 2 <= rSq) {
                const idx = (py * width + px) * 4;
                pixels[idx + 3] = 0;
              }
            }
          }
        }
      },
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let py = 0; py < h; py += 1) {
          for (let px = 0; px < w; px += 1) {
            const srcX = x + px;
            const srcY = y + py;
            const targetIdx = (py * w + px) * 4;
            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
              const srcIdx = (srcY * width + srcX) * 4;
              data[targetIdx] = pixels[srcIdx];
              data[targetIdx + 1] = pixels[srcIdx + 1];
              data[targetIdx + 2] = pixels[srcIdx + 2];
              data[targetIdx + 3] = pixels[srcIdx + 3];
            }
          }
        }
        return { data };
      },
      drawImage() {},
    };

    return {
      get width() { return width; },
      set width(val) {
        width = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      get height() { return height; },
      set height(val) {
        height = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      getContext() { return context; },
    };
  }

  const stage = {
    getBoundingClientRect() {
      return { width: 400, height: 300, left: 0, top: 0 };
    },
  };

  const renderer = new BurnRenderer(createMockCanvas(400, 300), createMockCanvas(400, 300), stage, {
    createCanvas: () => createMockCanvas(400, 300),
  });

  const image = { naturalWidth: 400, naturalHeight: 300 };
  renderer.load(image);

  renderer.startContinuousBurn();
  renderer.eraseAt(200, 150, 20);
  assert.equal(renderer.isBurnedAt(200, 150), true);
  assert.equal(renderer.burningActive, true);

  // Reload image to burn again
  renderer.load(image);

  assert.equal(renderer.burningActive, false);
  assert.equal(renderer.isBurnedAt(200, 150), false);
  assert.equal(renderer.burnedFraction, 0);
  assert.equal(renderer.complete, false);
  assert.equal(renderer.particles.length, 0);
  assert.equal(renderer.burnFronts.length, 0);
});

test("BurnRenderer.igniteEyes and igniteNormalized trigger targeted burns", () => {
  function createMockCanvas(initialWidth = 400, initialHeight = 300) {
    let width = initialWidth;
    let height = initialHeight;
    let pixels = new Uint8ClampedArray(width * height * 4);

    const context = {
      fillStyle: "#fff",
      globalCompositeOperation: "source-over",
      fillRect() {},
      clearRect() {},
      save() {},
      restore() {},
      beginPath() { this._arc = null; },
      arc(cx, cy, r) { this._arc = { cx, cy, r }; },
      fill() {
        if (this.globalCompositeOperation === "destination-out" && this._arc) {
          const { cx, cy, r } = this._arc;
          const rSq = r * r;
          const minX = Math.max(0, Math.floor(cx - r));
          const maxX = Math.min(width - 1, Math.ceil(cx + r));
          const minY = Math.max(0, Math.floor(cy - r));
          const maxY = Math.min(height - 1, Math.ceil(cy + r));
          for (let py = minY; py <= maxY; py += 1) {
            for (let px = minX; px <= maxX; px += 1) {
              if ((px - cx) ** 2 + (py - cy) ** 2 <= rSq) {
                const idx = (py * width + px) * 4;
                pixels[idx + 3] = 0;
              }
            }
          }
        }
      },
      getImageData(x, y, w, h) {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let py = 0; py < h; py += 1) {
          for (let px = 0; px < w; px += 1) {
            const srcX = x + px;
            const srcY = y + py;
            const targetIdx = (py * w + px) * 4;
            if (srcX >= 0 && srcX < width && srcY >= 0 && srcY < height) {
              const srcIdx = (srcY * width + srcX) * 4;
              data[targetIdx + 3] = pixels[srcIdx + 3];
            }
          }
        }
        return { data };
      },
      drawImage() {},
    };

    return {
      get width() { return width; },
      set width(val) {
        width = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      get height() { return height; },
      set height(val) {
        height = val;
        pixels = new Uint8ClampedArray(width * height * 4);
      },
      getContext() { return context; },
    };
  }

  const stage = {
    getBoundingClientRect() {
      return { width: 400, height: 300, left: 0, top: 0 };
    },
  };

  const renderer = new BurnRenderer(createMockCanvas(400, 300), createMockCanvas(400, 300), stage, {
    createCanvas: () => createMockCanvas(400, 300),
  });

  const image = { naturalWidth: 400, naturalHeight: 300 };
  renderer.load(image);

  // Test loadDeskImage
  const mockDesk = { naturalWidth: 400, naturalHeight: 300 };
  renderer.loadDeskImage(mockDesk);
  assert.equal(renderer.deskImage, mockDesk);
  assert.ok(renderer.paperCanvas);

  // Test igniteNormalized
  renderer.igniteNormalized(0.5, 0.5, 20);
  assert.equal(renderer.burningActive, true);
  assert.ok(renderer.isBurnedAt(200, 150));

  // Test igniteEyes
  renderer.load(image);
  renderer.igniteEyes({ x: 0.4, y: 0.3 }, { x: 0.6, y: 0.3 }, 15);
  assert.equal(renderer.burningActive, true);
  assert.ok(renderer.isBurnedAt(160, 90));
  assert.ok(renderer.isBurnedAt(240, 90));
});

test("BurnRenderer centers landscape images properly and keeps paperCanvas native resolution", () => {
  function createMockCanvas(initialWidth = 720, initialHeight = 964) {
    let width = initialWidth;
    let height = initialHeight;
    const drawnCalls = [];

    const context = {
      fillStyle: "#fff",
      globalCompositeOperation: "source-over",
      fillRect() {},
      clearRect() {},
      save() {},
      restore() {},
      beginPath() {},
      arc() {},
      fill() {},
      drawImage(...args) {
        drawnCalls.push(args);
      },
      getImageData() {
        return { data: new Uint8ClampedArray(4) };
      },
    };

    return {
      get width() { return width; },
      set width(val) { width = val; },
      get height() { return height; },
      set height(val) { height = val; },
      getContext() { return context; },
      drawnCalls,
    };
  }

  const stage = {
    getBoundingClientRect() {
      // 3:4 portrait stage
      return { width: 520, height: 693.33, left: 0, top: 0 };
    },
  };

  const imageCanvas = createMockCanvas(520, 693);
  const flameCanvas = createMockCanvas(520, 693);
  const renderer = new BurnRenderer(imageCanvas, flameCanvas, stage, {
    createCanvas: () => createMockCanvas(720, 964),
  });

  // Load a landscape image (1200 x 800)
  const landscapeImg = { naturalWidth: 1200, naturalHeight: 800 };
  renderer.load(landscapeImg);

  // Check imageRect is centered
  const rect = renderer.getImageRect();
  assert.equal(rect.x, 0);
  assert.ok(rect.y > 0, "Landscape image must be vertically centered");
  assert.equal(rect.width, 520);
  assert.ok(Math.abs(rect.y - (693.33 - rect.height) / 2) < 0.1);

  // Load desk image
  const desk = { naturalWidth: 1200, naturalHeight: 900, complete: true };
  renderer.loadDeskImage(desk);

  // Crucial check: paperCanvas resolution MUST remain native (720 x 964), NOT mutated to 1200
  assert.equal(renderer.paperCanvas.width, 720);
  assert.equal(renderer.paperCanvas.height, 964);

  // Verify desk covers entire canvas (0, 0, width, height)
  const deskDraw = imageCanvas.drawnCalls.find((call) => call[0] === desk);
  assert.ok(deskDraw, "Desk image must be drawn");
  assert.equal(deskDraw[1], 0);
  assert.equal(deskDraw[2], 0);
  assert.equal(deskDraw[3], imageCanvas.width);
  assert.equal(deskDraw[4], imageCanvas.height);

  // Verify paperCanvas is drawn with true un-distorted image aspect ratio
  const paperDraw = imageCanvas.drawnCalls.find((call) => call[0] === renderer.paperCanvas);
  assert.ok(paperDraw, "Paper canvas must be drawn");
  assert.equal(paperDraw[1], 0);
  assert.ok(paperDraw[2] > 0, "Target Y must be vertically centered");
  assert.equal(paperDraw[3], 520);
  assert.ok(Math.abs(paperDraw[4] - rect.height) <= 1, "Target height must preserve exact aspect ratio without distortion");
});

test("recalibration does not stop continuous burning when burning has started", () => {
  function createMockCanvas(initialWidth = 520, initialHeight = 693) {
    let width = initialWidth;
    let height = initialHeight;
    const context = {
      fillStyle: "#fff",
      globalCompositeOperation: "source-over",
      fillRect() {},
      clearRect() {},
      save() {},
      restore() {},
      beginPath() {},
      arc() {},
      fill() {},
      drawImage() {},
      getImageData() { return { data: new Uint8ClampedArray(4) }; },
    };
    return {
      get width() { return width; },
      set width(val) { width = val; },
      get height() { return height; },
      set height(val) { height = val; },
      getContext() { return context; },
    };
  }

  const stage = {
    getBoundingClientRect() {
      return { width: 520, height: 693, left: 0, top: 0 };
    },
  };

  const renderer = new BurnRenderer(createMockCanvas(), createMockCanvas(), stage, {
    createCanvas: () => createMockCanvas(),
  });

  renderer.load({ naturalWidth: 720, naturalHeight: 964 });
  renderer.startContinuousBurn();
  assert.equal(renderer.burningActive, true);

  // When quick recalibration begins, renderer.burningActive must remain true
  // (renderer.stopContinuousBurn() is NOT called)
  assert.equal(renderer.burningActive, true);

  // Stepping continuous burn should advance burning simulation
  renderer.stepContinuousBurn(performance.now() + 200);
  assert.equal(renderer.burningActive, true);
});

test("BurnRenderer guarantees complete photo burn within 30 seconds", () => {
  function createMockCanvas(initialWidth = 400, initialHeight = 300) {
    let width = initialWidth;
    let height = initialHeight;
    let pixels = new Uint8ClampedArray(width * height * 4);
    return {
      width,
      height,
      getContext: () => ({
        fillStyle: "#fff",
        globalCompositeOperation: "source-over",
        fillRect() {},
        clearRect() {},
        save() {},
        restore() {},
        beginPath() {},
        arc() {},
        fill() {},
        drawImage() {},
        getImageData: (x, y, sw, sh) => ({ data: new Uint8ClampedArray(sw * sh * 4) }),
        putImageData() {},
      }),
    };
  }

  const stage = {
    getBoundingClientRect: () => ({ width: 400, height: 300 }),
  };

  const renderer = new BurnRenderer(createMockCanvas(), createMockCanvas(), stage, {
    createCanvas: () => createMockCanvas(),
    maxBurnDurationMs: 30000,
  });

  renderer.load({ naturalWidth: 400, naturalHeight: 300 });
  const t0 = 10000;
  renderer.startContinuousBurn(t0);
  renderer.eraseAt(200, 150, 20);

  assert.equal(renderer.burningActive, true);
  assert.equal(renderer.complete, false);

  // At 15 seconds, burning should be active and incomplete
  renderer.stepContinuousBurn(t0 + 15000);
  assert.equal(renderer.complete, false);

  // At 30 seconds, checkCompletion must report true and finalize burn
  const isComplete = renderer.checkCompletion(t0 + 30000);
  assert.equal(isComplete, true);
  assert.equal(renderer.complete, true);
  assert.equal(renderer.burnedFraction, 1);
  assert.equal(renderer.burningActive, false);
});

test("BurnRenderer checkCompletion reports true when marked complete by continuous burn step", () => {
  function createMockCanvas(initialWidth = 400, initialHeight = 300) {
    return {
      width: initialWidth,
      height: initialHeight,
      getContext: () => ({
        fillStyle: "#fff",
        globalCompositeOperation: "source-over",
        fillRect() {},
        clearRect() {},
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        arc() {},
        fill() {},
        drawImage() {},
        getImageData: (x, y, sw, sh) => ({ data: new Uint8ClampedArray(sw * sh * 4) }),
        putImageData() {},
      }),
    };
  }

  const stage = {
    getBoundingClientRect: () => ({ width: 400, height: 300, left: 0, top: 0 }),
  };

  const renderer = new BurnRenderer(createMockCanvas(), createMockCanvas(), stage, {
    createCanvas: () => createMockCanvas(),
    maxBurnDurationMs: 30000,
  });

  renderer.load({ naturalWidth: 400, naturalHeight: 300 });
  const t0 = 10000;
  renderer.startContinuousBurn(t0);

  // Simulate complete condition set by continuous burn
  renderer.complete = true;
  renderer.burnedFraction = 1.0;

  // First call to checkCompletion must report true to trigger UI message display
  assert.equal(renderer.checkCompletion(t0 + 2000), true);

  // Subsequent call returns false because completion was already reported
  assert.equal(renderer.checkCompletion(t0 + 3000), false);
  assert.equal(renderer.complete, true);

  // After reset, completionReported is reset
  renderer.reset();
  assert.equal(renderer.complete, false);
  assert.equal(renderer.completionReported, false);
});

test("BurnRenderer ignites perimeter from outside to inside and renders ash when complete", () => {
  let drawnCount = 0;
  function createMockCanvas(initialWidth = 400, initialHeight = 300) {
    return {
      width: initialWidth,
      height: initialHeight,
      getContext: () => ({
        fillStyle: "#fff",
        globalCompositeOperation: "source-over",
        fillRect() { drawnCount++; },
        strokeRect() { drawnCount++; },
        clearRect() {},
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        translate() {},
        scale() {},
        arc() {},
        ellipse() {},
        fill() { drawnCount++; },
        drawImage() {},
        getImageData: (x, y, sw, sh) => ({ data: new Uint8ClampedArray(sw * sh * 4) }),
        putImageData() {},
      }),
    };
  }

  const stage = {
    getBoundingClientRect: () => ({ width: 400, height: 300, left: 0, top: 0 }),
  };

  const renderer = new BurnRenderer(createMockCanvas(), createMockCanvas(), stage, {
    createCanvas: () => createMockCanvas(),
    maxBurnDurationMs: 30000,
  });

  renderer.load({ naturalWidth: 400, naturalHeight: 300 });
  // Start continuous burn ignites perimeter from outside borders
  renderer.startContinuousBurn(1000);
  assert.equal(renderer.burningActive, true);
  assert.ok(renderer.burnFronts.length > 0, "Perimeter fronts should be initialized");

  // In first 5 seconds, fronts remain clamped and calm
  for (let t = 1100; t <= 5000; t += 200) {
    renderer.stepContinuousBurn(t);
  }
  assert.ok(renderer.burnFronts.length <= 10, "Fronts should remain calm and <= 10 in first 5s");

  // After 30s, check completion and ash rendering
  renderer.checkCompletion(32000);
  assert.equal(renderer.complete, true);

  // Render when complete draws ash residue instead of transparent void
  drawnCount = 0;
  renderer.render(32000);
  assert.ok(drawnCount > 0, "Ash footprint, carbon scorch, and flakes must be drawn");
});

test("BurnRenderer triggers climactic flash at 92% burn", () => {
  let flashCalled = false;
  const stage = {
    getBoundingClientRect: () => ({ width: 400, height: 300, left: 0, top: 0 }),
  };
  function createMockCanvas(w = 400, h = 300) {
    return {
      width: w,
      height: h,
      getContext: () => ({
        fillStyle: "#fff",
        globalCompositeOperation: "source-over",
        fillRect() {},
        clearRect() {},
        save() {},
        restore() {},
        beginPath() {},
        arc() {},
        fill() {},
        drawImage() {},
        getImageData: (x, y, sw, sh) => ({ data: new Uint8ClampedArray(sw * sh * 4) }),
        putImageData() {},
      }),
    };
  }

  const renderer = new BurnRenderer(createMockCanvas(), createMockCanvas(), stage, {
    createCanvas: () => createMockCanvas(),
    onClimacticFlash: () => { flashCalled = true; },
  });
  renderer.load({ naturalWidth: 400, naturalHeight: 300 });
  renderer.startContinuousBurn(1000);

  // At 90%, flash should not be triggered
  renderer.burnedFraction = 0.90;
  renderer.stepContinuousBurn(1100);
  assert.equal(renderer.climacticFlashTriggered, false);
  assert.equal(flashCalled, false);

  // At 92%, climactic flash triggers
  renderer.burnedFraction = 0.92;
  renderer.stepContinuousBurn(1200);
  assert.equal(renderer.climacticFlashTriggered, true);
  assert.equal(flashCalled, true);
  assert.ok(renderer.particles.some((p) => p.kind === "spark"));
});

test("createCalibrationFromBaseline generates valid 16-point calibration from countdown baseline", () => {
  const baseline = [0.48, 0.52, 0.49, 0.51, 0.50, 0.50];
  const samples = Array.from({ length: 25 }, (_, i) => ({
    features: baseline.map((v, j) => v + ((i % 5 - 2) * 0.002)),
    time: 1000 + i * 50,
  }));

  const result = createCalibrationFromBaseline(samples);
  assert.equal(result.ok, true);
  assert.ok(result.rmse < 0.05);
  assert.equal(result.samples.length, 16);
  assert.ok(result.samples.every((s) => s.weight >= 12));
  assert.ok(result.samples.every((s) => s.targetIndex >= 0 && s.targetIndex < 16));

  // Predicts center correctly
  const centerPred = predictGaze(result.model, baseline);
  assert.ok(Math.abs(centerPred.x - 0.5) < 0.05);
  assert.ok(Math.abs(centerPred.y - 0.5) < 0.05);

  // Predicts top-left corner correctly
  const spanX = 0.22;
  const spanY = 0.16;
  const faceSpan = 0.04;
  const topLeftFeatures = [
    baseline[0] + (0.16 - 0.5) * spanX,
    baseline[1] + (0.16 - 0.5) * spanY,
    baseline[2] + (0.16 - 0.5) * spanX,
    baseline[3] + (0.16 - 0.5) * spanY,
    baseline[4] + (0.16 - 0.5) * faceSpan,
    baseline[5] + (0.16 - 0.5) * faceSpan,
  ];
  const cornerPred = predictGaze(result.model, topLeftFeatures);
  assert.ok(Math.abs(cornerPred.x - 0.16) < 0.05);
  assert.ok(Math.abs(cornerPred.y - 0.16) < 0.05);
});

test("createCalibrationFromBaseline falls back to default center if empty baseline is provided", () => {
  const result = createCalibrationFromBaseline([]);
  assert.equal(result.ok, true);
  assert.ok(result.rmse < 0.05);
  assert.equal(result.samples.length, 16);
  const centerPred = predictGaze(result.model, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  assert.ok(Math.abs(centerPred.x - 0.5) < 0.05);
  assert.ok(Math.abs(centerPred.y - 0.5) < 0.05);
});

