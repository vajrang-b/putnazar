export const CALIBRATION_POINTS = [
  { x: 0.16, y: 0.16 },
  { x: 0.39, y: 0.16 },
  { x: 0.61, y: 0.16 },
  { x: 0.84, y: 0.16 },
  { x: 0.16, y: 0.39 },
  { x: 0.39, y: 0.39 },
  { x: 0.61, y: 0.39 },
  { x: 0.84, y: 0.39 },
  { x: 0.16, y: 0.61 },
  { x: 0.39, y: 0.61 },
  { x: 0.61, y: 0.61 },
  { x: 0.84, y: 0.61 },
  { x: 0.16, y: 0.84 },
  { x: 0.39, y: 0.84 },
  { x: 0.61, y: 0.84 },
  { x: 0.84, y: 0.84 },
];
export const ERROR_CORRECTION_POINTS = [
  { x: 0.50, y: 0.50 },
  { x: 0.28, y: 0.28 },
  { x: 0.72, y: 0.28 },
  { x: 0.50, y: 0.72 },
];
export const ALL_TRAINING_POINTS = [...CALIBRATION_POINTS, ...ERROR_CORRECTION_POINTS];
export const MAX_CALIBRATION_POINT_COUNT = CALIBRATION_POINTS.length + 4;
export const QUICK_CALIBRATION_POINT_COUNT = 4;
export const CALIBRATION_SETTLE_MS = 400;
export const AUTO_RECALIBRATE_STALL_MS = 5000;
export const AUTO_RECALIBRATE_COOLDOWN_MS = 8000;

export function getImagePhase(hasCalibration, cameraActive) {
  if (!hasCalibration) return "image-ready";
  return cameraActive ? "burning" : "calibrated";
}

export function isCalibrationPointSettled(elapsed) {
  return Number.isFinite(elapsed) && elapsed >= CALIBRATION_SETTLE_MS;
}

export function shouldTriggerAutoRecalibration({
  phase,
  hasModel,
  hasStream,
  hasActiveGaze,
  unburnedGazeElapsed,
  stallThresholdMs = AUTO_RECALIBRATE_STALL_MS,
  isComplete = false,
  cooldownUntil = 0,
  now = 0,
  isLookingAtBurnt = false,
  lookingAtBurnt = false,
  isLookingAtBurntPlace = false,
  tryingToLookAtBurnt = false,
}) {
  if (phase !== "burning") return false;
  if (!hasModel || !hasStream) return false;
  if (isComplete) return false;
  if (now < cooldownUntil) return false;
  if (!hasActiveGaze) return false;
  if (isLookingAtBurnt || lookingAtBurnt || isLookingAtBurntPlace || tryingToLookAtBurnt) {
    return true;
  }
  return Number.isFinite(unburnedGazeElapsed) && unburnedGazeElapsed >= stallThresholdMs;
}

export function isTryingToLookAtBurnt(arg1, arg2) {
  if (typeof arg1 === "object" && arg1 !== null) {
    return Boolean(arg1.isBurnt && (arg1.dwellActive ?? arg1.active ?? true));
  }
  return Boolean(arg1 && (arg2 ?? true));
}

export function selectRefinementTargets(candidates, existingTargets = CALIBRATION_POINTS, count = QUICK_CALIBRATION_POINT_COUNT) {
  const remaining = candidates.filter(({ x, y, coverage }) =>
    Number.isFinite(x) && x >= 0.08 && x <= 0.92
      && Number.isFinite(y) && y >= 0.08 && y <= 0.92
      && Number.isFinite(coverage) && coverage >= 0.6,
  );
  const referencePoints = existingTargets.filter(({ x, y }) => Number.isFinite(x) && Number.isFinite(y));
  const selected = [];

  while (selected.length < count && remaining.length) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const anchors = [...referencePoints, ...selected];
      const nearestDistance = anchors.length
        ? Math.sqrt(Math.min(...anchors.map(({ x, y }) => (candidate.x - x) ** 2 + (candidate.y - y) ** 2)))
        : 0;
      const score = candidate.coverage * 0.4 + nearestDistance;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    selected.push(remaining.splice(bestIndex, 1)[0]);
  }
  return selected.map(({ x, y }) => ({ x, y }));
}

export function filterSampleOutliers(samples) {
  if (!Array.isArray(samples) || samples.length <= 4) return samples;
  const featureCount = samples[0]?.features?.length;
  if (!featureCount) return samples;

  const medians = Array.from({ length: featureCount }, (_, dim) => {
    const vals = samples.map((s) => s.features[dim]).filter(Number.isFinite).sort((a, b) => a - b);
    if (!vals.length) return 0;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 !== 0 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
  });

  const distances = samples.map((sample) => {
    const distSq = sample.features.reduce((sum, val, dim) => sum + (val - medians[dim]) ** 2, 0);
    return Math.sqrt(distSq);
  });

  const sortedDists = distances.slice().sort((a, b) => a - b);
  const medianDist = sortedDists[Math.floor(sortedDists.length / 2)] || 0.001;
  const scale = Math.max(medianDist * 2.5, 0.0005);

  const rawWeights = samples.map((sample, idx) => {
    const d = distances[idx] / scale;
    const baseWeight = sample.weight ?? 1;
    const robustFactor = 1 / (1 + d * d);
    return baseWeight * robustFactor;
  });

  const targetWeightSum = samples.reduce((sum, s) => sum + (s.weight ?? 1), 0);
  const rawWeightSum = rawWeights.reduce((sum, w) => sum + w, 0) || 1;
  const normFactor = targetWeightSum / rawWeightSum;

  return samples.map((sample, idx) => ({
    ...sample,
    weight: rawWeights[idx] * normFactor,
  }));
}

export function aggregateCalibrationSamples(samples) {
  const pointCount = samples.reduce((count, sample) =>
    Number.isInteger(sample.targetIndex) && sample.targetIndex >= 0
      ? Math.max(count, sample.targetIndex + 1)
      : count, CALIBRATION_POINTS.length);

  const byTarget = Array.from({ length: pointCount }, () => []);
  for (const sample of samples) {
    if (Number.isInteger(sample.targetIndex) && sample.targetIndex >= 0 && sample.targetIndex < pointCount) {
      byTarget[sample.targetIndex].push(sample);
    }
  }

  return byTarget.flatMap((targetSamples, targetIndex) => {
    if (!targetSamples.length) return [];
    const totalWeight = targetSamples.reduce((sum, s) => sum + (s.weight ?? 1), 0);
    const cleaned = filterSampleOutliers(targetSamples);
    const cleanedWeight = cleaned.reduce((sum, s) => sum + (s.weight ?? 1), 0);
    if (cleanedWeight <= 0) return [];

    const featureCount = cleaned[0].features.length;
    const features = Array(featureCount).fill(0);
    for (const sample of cleaned) {
      const weight = sample.weight ?? 1;
      sample.features.forEach((val, idx) => {
        features[idx] += val * weight;
      });
    }

    return [{
      targetIndex,
      target: cleaned[0].target,
      features: features.map((val) => val / cleanedWeight),
      weight: totalWeight,
    }];
  });
}

const EYE_FEATURES = [
  { corners: [33, 133], upper: 159, lower: 145, iris: 468 },
  { corners: [362, 263], upper: 386, lower: 374, iris: 473 },
];

function normalizedBetween(value, first, second) {
  const span = Math.abs(second - first);
  if (span < 0.0001) return null;
  return (value - Math.min(first, second)) / span;
}

export function extractGazeFeatures(landmarks) {
  if (!landmarks || landmarks.length < 478) return null;

  const features = [];
  for (const eye of EYE_FEATURES) {
    const first = landmarks[eye.corners[0]];
    const second = landmarks[eye.corners[1]];
    const upper = landmarks[eye.upper];
    const lower = landmarks[eye.lower];
    const iris = landmarks[eye.iris];
    if (![first, second, upper, lower, iris].every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))) {
      return null;
    }

    const hSpan = Math.abs(second.x - first.x);
    const vSpan = Math.abs(lower.y - upper.y);
    if (hSpan < 0.005 || vSpan / hSpan < 0.08) return null;

    const horizontal = normalizedBetween(iris.x, first.x, second.x);
    const vertical = normalizedBetween(iris.y, upper.y, lower.y);
    if (horizontal === null || vertical === null) return null;
    features.push(horizontal, vertical);
  }

  const nose = landmarks[1];
  const leftFace = landmarks[234];
  const rightFace = landmarks[454];
  const forehead = landmarks[10];
  const chin = landmarks[152];
  if (![nose, leftFace, rightFace, forehead, chin].every((point) => point && Number.isFinite(point.x) && Number.isFinite(point.y))) {
    return null;
  }

  const faceWidth = Math.abs(rightFace.x - leftFace.x);
  const faceHeight = Math.abs(chin.y - forehead.y);
  if (faceWidth < 0.0001 || faceHeight < 0.0001) return null;
  features.push(
    (nose.x - Math.min(leftFace.x, rightFace.x)) / faceWidth,
    (nose.y - Math.min(forehead.y, chin.y)) / faceHeight,
  );
  return features;
}

export function expandGazeFeatures(features) {
  if (!Array.isArray(features) || !features.every(Number.isFinite)) return null;
  if (features.length !== 6) return features;
  const [lH, lV, rH, rV, faceH, faceV] = features;
  return [
    lH,
    lV,
    rH,
    rV,
    faceH,
    faceV,
    lH ** 2,
    lV ** 2,
    rH ** 2,
    rV ** 2,
    lH * lV,
    rH * rV,
    lH * faceH,
    lV * faceV,
  ];
}

function solveLinearSystem(matrix, values) {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);

  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-10) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];

    const divisor = rows[column][column];
    for (let index = column; index <= size; index += 1) rows[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let index = column; index <= size; index += 1) {
        rows[row][index] -= factor * rows[column][index];
      }
    }
  }
  return rows.map((row) => row[size]);
}

export function fitCalibration(samples, { minimumSamplesPerPoint = 12, ridge = 0.002, useExpansion = false } = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    return { ok: false, reason: "No gaze samples were collected." };
  }
  const shouldExpand = useExpansion && samples[0].features?.length === 6;
  const processedSamples = shouldExpand
    ? samples.map((sample) => ({ ...sample, features: expandGazeFeatures(sample.features) }))
    : samples;
  const featureCount = processedSamples[0].features?.length;
  if (!Number.isInteger(featureCount) || featureCount < 2) {
    return { ok: false, reason: "The camera could not get a clear eye reading." };
  }
  if (processedSamples.some((sample) =>
    !Number.isInteger(sample.targetIndex) || sample.targetIndex < 0 || sample.targetIndex >= MAX_CALIBRATION_POINT_COUNT
      || !sample.features?.every(Number.isFinite)
      || !Number.isFinite(sample.target?.x) || sample.target.x < 0 || sample.target.x > 1
      || !Number.isFinite(sample.target?.y) || sample.target.y < 0 || sample.target.y > 1
      || (sample.weight !== undefined && (!Number.isFinite(sample.weight) || sample.weight <= 0)),
  )) {
    return { ok: false, reason: "Gaze tracking returned an incomplete sample. Please retry." };
  }
  const pointCount = processedSamples.reduce((count, sample) => Math.max(count, sample.targetIndex + 1), CALIBRATION_POINTS.length);
  const counts = Array.from({ length: pointCount }, (_, index) =>
    processedSamples.reduce((count, sample) =>
      count + (sample.targetIndex === index && sample.features?.length === featureCount ? sample.weight ?? 1 : 0), 0),
  );
  if (counts.some((count) => count < minimumSamplesPerPoint)) {
    return { ok: false, reason: "Not enough steady samples. Please retry and keep your head still." };
  }

  const dimensions = featureCount + 1;
  const normal = Array.from({ length: dimensions }, () => Array(dimensions).fill(0));
  const xValues = Array(dimensions).fill(0);
  const yValues = Array(dimensions).fill(0);

  for (const sample of processedSamples) {
    const weight = sample.weight ?? 1;
    const row = [1, ...sample.features];
    for (let left = 0; left < dimensions; left += 1) {
      xValues[left] += row[left] * sample.target.x * weight;
      yValues[left] += row[left] * sample.target.y * weight;
      for (let right = 0; right < dimensions; right += 1) {
        normal[left][right] += row[left] * row[right] * weight;
      }
    }
  }
  for (let index = 1; index < dimensions; index += 1) normal[index][index] += ridge;

  const xCoefficients = solveLinearSystem(normal, xValues);
  const yCoefficients = solveLinearSystem(normal, yValues);
  if (!xCoefficients || !yCoefficients) {
    return { ok: false, reason: "Calibration was unstable. Please try again with your face centered." };
  }

  const model = { xCoefficients, yCoefficients, featureCount };
  const squaredError = processedSamples.reduce((sum, sample) => {
    const point = predictGaze(model, sample.features);
    return sum + ((point.x - sample.target.x) ** 2 + (point.y - sample.target.y) ** 2) * (sample.weight ?? 1);
  }, 0);
  const sampleCount = processedSamples.reduce((count, sample) => count + (sample.weight ?? 1), 0);
  const rmse = Math.sqrt(squaredError / (2 * sampleCount));
  return { ok: true, model, rmse, sampleCount };
}

export function predictGaze(model, features) {
  if (!model || !features || !features.every(Number.isFinite)) return null;
  const inputFeatures = features.length === 6 && model.featureCount === 14
    ? expandGazeFeatures(features)
    : features;
  if (!inputFeatures || inputFeatures.length !== model.featureCount) return null;
  const values = [1, ...inputFeatures];
  return {
    x: model.xCoefficients.reduce((sum, coefficient, index) => sum + coefficient * values[index], 0),
    y: model.yCoefficients.reduce((sum, coefficient, index) => sum + coefficient * values[index], 0),
  };
}

export function mapGazeToRect(gaze, rect) {
  if (!gaze || rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: rect.left + gaze.x * rect.width,
    y: rect.top + gaze.y * rect.height,
  };
}

export class DwellTracker {
  constructor({ dwellMs = 200, radius = 48 } = {}) {
    this.dwellMs = dwellMs;
    this.radius = radius;
    this.anchor = null;
    this.startedAt = null;
  }

  reset() {
    this.anchor = null;
    this.startedAt = null;
  }

  observe(point, now) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      this.reset();
      return { active: false, progress: 0 };
    }
    if (!this.anchor || Math.hypot(point.x - this.anchor.x, point.y - this.anchor.y) > this.radius) {
      this.anchor = { x: point.x, y: point.y };
      this.startedAt = now;
      return { active: false, progress: 0 };
    }
    const elapsed = Math.max(0, now - this.startedAt);
    const progress = Math.min(1, elapsed / this.dwellMs);
    return { active: progress >= 1, progress };
  }
}

export function createCalibrationFromBaseline(baselineSamples, {
  spanX = 0.22,
  spanY = 0.16,
  faceSpanX = 0.04,
  faceSpanY = 0.04,
  pointsPerTarget = 15,
  useExpansion = true,
} = {}) {
  const rawFeatures = (baselineSamples || [])
    .map((s) => (Array.isArray(s) ? s : s?.features))
    .filter((f) => Array.isArray(f) && f.length === 6 && f.every(Number.isFinite));

  const mean = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  if (rawFeatures.length > 0) {
    for (let j = 0; j < 6; j += 1) mean[j] = 0;
    for (const f of rawFeatures) {
      for (let j = 0; j < 6; j += 1) mean[j] += f[j];
    }
    for (let j = 0; j < 6; j += 1) mean[j] /= rawFeatures.length;
  }

  const samples = [];
  CALIBRATION_POINTS.forEach((target, targetIndex) => {
    const dx = target.x - 0.5;
    const dy = target.y - 0.5;
    for (let i = 0; i < pointsPerTarget; i += 1) {
      const jitter = (i % 3 - 1) * 0.001;
      const lH = mean[0] + dx * spanX + jitter;
      const lV = mean[1] + dy * spanY + jitter;
      const rH = mean[2] + dx * spanX + jitter;
      const rV = mean[3] + dy * spanY + jitter;
      const faceH = mean[4] + dx * faceSpanX;
      const faceV = mean[5] + dy * faceSpanY;
      samples.push({
        target: { x: target.x, y: target.y },
        targetIndex,
        features: [lH, lV, rH, rV, faceH, faceV],
      });
    }
  });

  const aggregated = aggregateCalibrationSamples(samples);
  const result = fitCalibration(aggregated, { useExpansion });
  if (!result.ok) return result;

  return {
    ok: true,
    model: result.model,
    rmse: result.rmse,
    samples: aggregated,
    mean,
  };
}
