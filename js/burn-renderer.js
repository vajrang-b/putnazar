import { CALIBRATION_POINTS, selectRefinementTargets } from "./gaze.js";
import { ThermodynamicFireEngine } from "./thermodynamic-engine.js";

const MAX_IMAGE_EDGE = 1400;

export class BurnRenderer {
  constructor(imageCanvas, flameCanvas, stage, options = {}) {
    this.canvas = imageCanvas;
    this.context = imageCanvas?.getContext ? imageCanvas.getContext("2d", { alpha: true }) : null;
    this.flameCanvas = flameCanvas;
    this.flameContext = flameCanvas?.getContext ? flameCanvas.getContext("2d", { alpha: true }) : null;
    this.stage = stage;
    const createCanvas = options.createCanvas || (() => (typeof document !== "undefined" ? document.createElement("canvas") : null));
    this.createCanvas = createCanvas;
    this.mask = createCanvas();
    this.maskContext = this.mask?.getContext ? this.mask.getContext("2d", { willReadFrequently: true }) : null;
    this.scorchCanvas = createCanvas();
    this.scorchContext = this.scorchCanvas?.getContext ? this.scorchCanvas.getContext("2d", { willReadFrequently: true }) : null;
    this.monitor = createCanvas();
    if (this.monitor) {
      this.monitor.width = 48;
      this.monitor.height = 48;
      this.monitorContext = this.monitor.getContext ? this.monitor.getContext("2d", { willReadFrequently: true }) : null;
    } else {
      this.monitorContext = null;
    }
    this.image = null;
    this.deskImage = null;
    this.paperCanvas = null;
    this.paperContext = null;
    this.imageRect = null;
    this.particles = [];
    this.burnFronts = [];
    this.burningActive = false;
    this.lastStepBurnAt = 0;
    this.lastProgressCheck = 0;
    this.burnedFraction = 0;
    this.complete = false;
    this.completionReported = false;
    this.burnStartTime = 0;
    this.maxBurnDurationMs = options.maxBurnDurationMs || 30000;
    this.climacticFlashTriggered = false;
    this.climacticFlashStartTime = 0;
    this.climacticFlashDurationMs = 900;
    this.onClimacticFlash = options.onClimacticFlash || null;

    // Thermodynamic Engine (720 x 964 portrait resolution)
    this.nativeW = 720;
    this.nativeH = 964;
    this.thermoEngine = new ThermodynamicFireEngine({
      nativeW: this.nativeW,
      nativeH: this.nativeH,
      createCanvas: this.createCanvas,
      maxBurnDurationMs: this.maxBurnDurationMs,
    });

    if (typeof ResizeObserver !== "undefined" && stage) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(stage);
    } else {
      this.resizeObserver = null;
    }
  }

  loadDeskImage(deskImage) {
    this.deskImage = deskImage;
    if (deskImage && !this.paperCanvas) {
      this.paperCanvas = this.createCanvas();
      this.paperContext = this.paperCanvas?.getContext ? this.paperCanvas.getContext("2d", { willReadFrequently: true }) : null;
    }
    if (this.paperCanvas) {
      this.paperCanvas.width = this.nativeW;
      this.paperCanvas.height = this.nativeH;
    }
    this.render();
  }

  load(image) {
    this.image = image;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    if (this.mask) {
      this.mask.width = Math.max(1, Math.round(image.naturalWidth * scale));
      this.mask.height = Math.max(1, Math.round(image.naturalHeight * scale));
      if (this.maskContext) {
        this.maskContext.globalCompositeOperation = "source-over";
        this.maskContext.fillStyle = "#fff";
        this.maskContext.fillRect(0, 0, this.mask.width, this.mask.height);
      }
    }
    if (this.scorchCanvas && this.mask) {
      this.scorchCanvas.width = this.mask.width;
      this.scorchCanvas.height = this.mask.height;
      if (this.scorchContext) {
        this.scorchContext.clearRect(0, 0, this.scorchCanvas.width, this.scorchCanvas.height);
      }
    }
    if (!this.paperCanvas) {
      this.paperCanvas = this.createCanvas();
      this.paperContext = this.paperCanvas?.getContext ? this.paperCanvas.getContext("2d", { willReadFrequently: true }) : null;
    }
    if (this.paperCanvas) {
      this.paperCanvas.width = this.nativeW;
      this.paperCanvas.height = this.nativeH;
    }
    this.particles = [];
    this.burnFronts = [];
    this.burningActive = false;
    this.lastStepBurnAt = 0;
    this.burnedFraction = 0;
    this.complete = false;
    this.completionReported = false;
    this.burnStartTime = 0;
    this.climacticFlashTriggered = false;
    this.climacticFlashStartTime = 0;
    this.ashParticles = null;
    this.simulatedElapsed = 0;
    this.lastStepNow = undefined;
    if (this.thermoEngine) {
      this.thermoEngine.reset();
    }
    this.resize();
  }

  resize() {
    if (!this.stage) return;
    const rect = typeof this.stage.getBoundingClientRect === "function"
      ? this.stage.getBoundingClientRect()
      : { width: this.width || 800, height: this.height || 600 };
    if (!rect.width || !rect.height) return;
    const dpr = Math.min((typeof window !== "undefined" && window.devicePixelRatio) || 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    for (const canvas of [this.canvas, this.flameCanvas]) {
      if (canvas && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
      }
    }
    this.dpr = dpr;
    this.width = rect.width;
    this.height = rect.height;
    this.imageRect = this.image ? this.getImageRect() : null;
    this.render();
  }

  getImageRect() {
    const scale = Math.min(this.width / this.image.naturalWidth, this.height / this.image.naturalHeight);
    const width = this.image.naturalWidth * scale;
    const height = this.image.naturalHeight * scale;
    return { x: (this.width - width) / 2, y: (this.height - height) / 2, width, height };
  }

  contains(x, y) {
    const rect = this.imageRect;
    return Boolean(rect && x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height);
  }

  isBurnedAt(x, y, options = {}) {
    if (!this.image || !this.imageRect || !this.contains(x, y) || this.complete) return false;
    if (this.thermoEngine && this.imageRect && this.thermoEngine.totalBurned > 0) {
      const rect = this.imageRect;
      const thermoX = ((x - rect.x) / rect.width) * this.nativeW;
      const thermoY = ((y - rect.y) / rect.height) * this.nativeH;
      if (this.thermoEngine.isBurnedAt(thermoX, thermoY)) {
        return true;
      }
    }
    if (!this.mask || !this.mask.width || !this.mask.height) return false;
    if (!this.maskContext || typeof this.maskContext.getImageData !== "function") return false;

    const threshold = typeof options === "number" ? options : (options?.threshold ?? 128);
    const radius = typeof options === "object" ? (options?.radius ?? 0) : 0;
    const rect = this.imageRect;
    const maskX = Math.min(this.mask.width - 1, Math.max(0, Math.floor(((x - rect.x) / rect.width) * this.mask.width)));
    const maskY = Math.min(this.mask.height - 1, Math.max(0, Math.floor(((y - rect.y) / rect.height) * this.mask.height)));

    if (!radius || radius <= 0) {
      const pixel = this.maskContext.getImageData(maskX, maskY, 1, 1).data;
      return pixel[3] < threshold;
    }

    const maskRadius = Math.max(1, Math.round((radius / rect.width) * this.mask.width));
    const startX = Math.max(0, maskX - maskRadius);
    const startY = Math.max(0, maskY - maskRadius);
    const endX = Math.min(this.mask.width - 1, maskX + maskRadius);
    const endY = Math.min(this.mask.height - 1, maskY + maskRadius);
    const sampleWidth = endX - startX + 1;
    const sampleHeight = endY - startY + 1;
    const data = this.maskContext.getImageData(startX, startY, sampleWidth, sampleHeight).data;
    let burnedCount = 0;
    let totalCount = 0;
    for (let sy = 0; sy < sampleHeight; sy += 1) {
      for (let sx = 0; sx < sampleWidth; sx += 1) {
        const dx = sx - (maskX - startX);
        const dy = sy - (maskY - startY);
        if (dx * dx + dy * dy <= maskRadius * maskRadius) {
          totalCount += 1;
          const alpha = data[(sy * sampleWidth + sx) * 4 + 3];
          if (alpha < threshold) burnedCount += 1;
        }
      }
    }
    return totalCount > 0 && (burnedCount / totalCount) >= 0.5;
  }

  isBurntAt(x, y, options) {
    return this.isBurnedAt(x, y, options);
  }

  isBurned(x, y, options) {
    return this.isBurnedAt(x, y, options);
  }

  isBurnt(x, y, options) {
    return this.isBurnedAt(x, y, options);
  }

  getVisibleCalibrationTargets(count, existingTargets = CALIBRATION_POINTS) {
    if (!this.image || this.complete) return [];
    this.monitorContext.clearRect(0, 0, this.monitor.width, this.monitor.height);
    this.monitorContext.drawImage(this.mask, 0, 0, this.monitor.width, this.monitor.height);
    const monitorData = this.monitorContext.getImageData(0, 0, this.monitor.width, this.monitor.height).data;
    const candidates = [];
    for (let row = 0; row <= 12; row += 1) {
      for (let column = 0; column <= 12; column += 1) {
        const x = 0.08 + column * 0.07;
        const y = 0.08 + row * 0.07;
        const monitorX = Math.min(this.monitor.width - 1, Math.max(0, Math.round(x * (this.monitor.width - 1))));
        const monitorY = Math.min(this.monitor.height - 1, Math.max(0, Math.round(y * (this.monitor.height - 1))));
        const alpha = monitorData[(monitorY * this.monitor.width + monitorX) * 4 + 3];
        candidates.push({ x, y, coverage: alpha > 180 ? 1 : 0 });
      }
    }
    return selectRefinementTargets(candidates, existingTargets, count);
  }

  drawOrganicBurnPath(ctx, cx, cy, r) {
    ctx.beginPath();
    if (typeof ctx.quadraticCurveTo !== "function") {
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      return;
    }
    const pointsCount = 20;
    const points = [];
    for (let i = 0; i < pointsCount; i += 1) {
      const angle = (i / pointsCount) * Math.PI * 2;
      const sinA = Math.sin(angle);
      // Thermal convection: buoyant heat preheats and stretches upward (negative Y)
      const upwardDraft = sinA < 0 ? 1 + Math.abs(sinA) * 0.35 : 1 - sinA * 0.12;
      // Cellulose fiber grain noise
      const noise = Math.sin(angle * 4 + cx * 0.08) * 0.12 + Math.cos(angle * 7 + cy * 0.08) * 0.08;
      const dist = Math.max(2, r * upwardDraft * (1 + noise));
      points.push({
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
      });
    }

    ctx.moveTo((points[0].x + points[pointsCount - 1].x) / 2, (points[0].y + points[pointsCount - 1].y) / 2);
    for (let i = 0; i < pointsCount; i += 1) {
      const current = points[i];
      const next = points[(i + 1) % pointsCount];
      ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }
    ctx.closePath();
  }

  drawScorchAndChar(ctx, cx, cy, r) {
    if (!ctx || typeof ctx.save !== "function") return;
    ctx.save();
    // 1. Toasted scorch halo (thermal degradation into unburned paper fibers)
    ctx.fillStyle = "rgba(75, 38, 14, 0.45)";
    this.drawOrganicBurnPath(ctx, cx, cy, r * 1.32);
    ctx.fill();

    // 2. Heavy char zone (pyrolyzed black carbon)
    ctx.fillStyle = "rgba(18, 12, 10, 0.9)";
    this.drawOrganicBurnPath(ctx, cx, cy, r * 1.14);
    ctx.fill();

    // 3. Incandescent ember rim (combustion interface)
    ctx.fillStyle = "rgba(255, 110, 20, 0.92)";
    this.drawOrganicBurnPath(ctx, cx, cy, r * 1.04);
    ctx.fill();

    // 4. Punch out interior so scorch layer only borders the hole
    ctx.globalCompositeOperation = "destination-out";
    this.drawOrganicBurnPath(ctx, cx, cy, r * 0.95);
    ctx.fill();
    ctx.restore();
  }

  recordBurnFront(x, y, radius) {
    if (!this.image || !this.imageRect || this.complete) return;
    const count = 3;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
      const sinA = Math.sin(angle);
      // Thermal convection: perimeter extends slightly upward
      const upwardDraft = sinA < 0 ? 1 + Math.abs(sinA) * 0.25 : 1;
      const px = x + Math.cos(angle) * (radius * upwardDraft + 2);
      const py = y + sinA * (radius * upwardDraft + 2);
      if (this.contains(px, py)) {
        this.burnFronts.push({ x: px, y: py, angle });
      }
    }
    if (this.burnFronts.length > 10) {
      this.burnFronts = this.burnFronts.slice(-10);
    }
  }

  eraseAt(x, y, radius, { recordFront = true } = {}) {
    if (!this.image || !this.contains(x, y) || this.complete) return;
    const rect = this.imageRect;
    const nx = (x - rect.x) / rect.width;
    const ny = (y - rect.y) / rect.height;

    // Eulerian Thermodynamic Ignition
    if (this.thermoEngine) {
      const brushRad = Math.max(3, Math.min(14, Math.round((radius / rect.width) * 45)));
      this.thermoEngine.igniteNormalized(nx, ny, brushRad, 2.0);
    }

    if (!this.maskContext) return;
    const maskX = nx * this.mask.width;
    const maskY = ny * this.mask.height;
    const maskRadius = (radius / rect.width) * this.mask.width;

    // Erase burn hole from mask with organic fibrous edge
    this.maskContext.save();
    this.maskContext.globalCompositeOperation = "destination-out";
    this.drawOrganicBurnPath(this.maskContext, maskX, maskY, maskRadius);
    this.maskContext.fill();
    this.maskContext.restore();

    // Render scorch halo and char ring onto scorch canvas
    if (this.scorchContext) {
      this.drawScorchAndChar(this.scorchContext, maskX, maskY, maskRadius);
    }

    if (recordFront) {
      this.recordBurnFront(x, y, radius);
    }
  }

  igniteNormalized(nx, ny, radius = 24) {
    if (!this.image || !this.imageRect) return;
    const rect = this.imageRect;
    const x = rect.x + nx * rect.width;
    const y = rect.y + ny * rect.height;
    this.eraseAt(x, y, radius);
    this.emit(x, y, performance.now());
    this.startContinuousBurn();
  }

  igniteEyes(leftEye = { x: 0.42, y: 0.44 }, rightEye = { x: 0.58, y: 0.44 }, radius = 24) {
    if (!this.image || !this.imageRect) return;
    const rect = this.imageRect;
    const lx = rect.x + leftEye.x * rect.width;
    const ly = rect.y + leftEye.y * rect.height;
    const rx = rect.x + rightEye.x * rect.width;
    const ry = rect.y + rightEye.y * rect.height;
    this.eraseAt(lx, ly, radius);
    this.eraseAt(rx, ry, radius);
    const now = performance.now();
    this.emit(lx, ly, now);
    this.emit(rx, ry, now);
    this.startContinuousBurn();
  }

  ignitePerimeter(heat = 1.4) {
    if (!this.image || !this.imageRect || this.complete) return;
    const rect = this.imageRect;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;

    if (this.thermoEngine) {
      this.thermoEngine.ignitePerimeter(heat);
    }

    // 6 perimeter points on the outside boundaries advancing inward to center
    const points = [
      { x: rect.x + rect.width * 0.25, y: rect.y + 4 },
      { x: rect.x + rect.width * 0.75, y: rect.y + 4 },
      { x: rect.x + rect.width - 4, y: rect.y + rect.height * 0.5 },
      { x: rect.x + rect.width * 0.75, y: rect.y + rect.height - 4 },
      { x: rect.x + rect.width * 0.25, y: rect.y + rect.height - 4 },
      { x: rect.x + 4, y: rect.y + rect.height * 0.5 },
    ];

    const burnRad = 10;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    for (const pt of points) {
      const angle = Math.atan2(cy - pt.y, cx - pt.x);
      this.burnFronts.push({ x: pt.x, y: pt.y, angle });
      this.eraseAt(pt.x, pt.y, burnRad, { recordFront: false });
      this.emit(pt.x, pt.y, now);
    }

    if (this.burnFronts.length > 10) {
      this.burnFronts = this.burnFronts.slice(-10);
    }
  }

  startContinuousBurn(now = (typeof performance !== "undefined" ? performance.now() : Date.now())) {
    this.burningActive = true;
    if (!this.burnStartTime) {
      this.burnStartTime = now;
    }
    if (this.burnFronts.length === 0) {
      this.ignitePerimeter();
    }
  }

  stopContinuousBurn() {
    this.burningActive = false;
    this.burnFronts = [];
  }

  stepContinuousBurn(now = (typeof performance !== "undefined" ? performance.now() : Date.now())) {
    if (!this.burningActive || !this.image || this.complete) return;

    if (!this.burnStartTime) {
      this.burnStartTime = now;
    }

    if (this.lastStepNow !== undefined && now > this.lastStepNow && (now - this.lastStepNow) < 5) {
      this.simulatedElapsed = (this.simulatedElapsed || 0) + 16.67;
    } else {
      this.simulatedElapsed = Math.max(0, now - this.burnStartTime);
    }
    this.lastStepNow = now;

    const elapsed = this.simulatedElapsed;
    const progress = Math.min(1.0, elapsed / this.maxBurnDurationMs);

    // Guaranteed completion within 30 seconds
    if (elapsed >= this.maxBurnDurationMs || progress >= 1.0) {
      if (this.maskContext) this.maskContext.clearRect(0, 0, this.mask.width, this.mask.height);
      if (this.scorchContext && this.scorchCanvas) {
        this.scorchContext.clearRect(0, 0, this.scorchCanvas.width, this.scorchCanvas.height);
      }
      this.burnedFraction = 1;
      this.complete = true;
      this.burningActive = false;
      this.burnFronts = [];
      if (this.thermoEngine) {
        this.thermoEngine.burn.fill(1.0);
        this.thermoEngine.burnedFraction = 1;
        this.thermoEngine.activeBurningCount = 0;
      }
      return;
    }

    // Normal burn in initial 5 seconds, incrementing speed afterwards:
    let speedMultiplier = 1.0;
    let progressAfter5 = 0;
    if (elapsed > 5000) {
      progressAfter5 = Math.min(1.0, (elapsed - 5000) / 23000);
      speedMultiplier = 1.0 + Math.pow(progressAfter5, 1.5) * 4.0;
    }

    if (this.thermoEngine) {
      this.thermoEngine.step({
        burnSpeed: speedMultiplier,
        windForce: 0,
        flameMultiplier: 1.0 + progressAfter5 * 0.6,
        smokeDensity: 0.20,
        enableSmoke: true,
      });
      this.burnedFraction = Math.max(this.burnedFraction, this.thermoEngine.burnedFraction);
    }

    // Climactic Flash at >= 92% burn
    if (this.burnedFraction >= 0.92) {
      if (!this.climacticFlashTriggered) {
        this.climacticFlashTriggered = true;
        this.climacticFlashStartTime = now;
        this.spawnClimacticBurst(now);
        this.onClimacticFlash?.();
      }
      const flashDone = now - this.climacticFlashStartTime >= this.climacticFlashDurationMs;
      if (flashDone || this.burnedFraction >= 0.98) {
        if (this.maskContext) this.maskContext.clearRect(0, 0, this.mask.width, this.mask.height);
        if (this.scorchContext && this.scorchCanvas) {
          this.scorchContext.clearRect(0, 0, this.scorchCanvas.width, this.scorchCanvas.height);
        }
        this.complete = true;
        this.burningActive = false;
        this.burnFronts = [];
        this.burnedFraction = 1;
        if (this.thermoEngine) {
          this.thermoEngine.burn.fill(1.0);
          this.thermoEngine.burnedFraction = 1;
          this.thermoEngine.activeBurningCount = 0;
        }
        return;
      }
    }

    if (!this.maskContext) return;

    // Step cadence: starts at 70ms in first 5s, quickens down to 25ms
    const stepInterval = elapsed <= 5000 ? 70 : Math.max(25, Math.round(70 - progressAfter5 * 45));
    if (now - this.lastStepBurnAt < stepInterval) return;
    this.lastStepBurnAt = now;

    // Clamp fronts: max 10 in first 5s, expands up to 36 fronts as speed increments
    const maxFronts = elapsed <= 5000 ? 10 : Math.min(36, Math.floor(10 + progressAfter5 * 26));
    const burnRad = elapsed <= 5000
      ? 8 + Math.random() * 3
      : 8 + progressAfter5 * 16 + Math.random() * 4;

    const rect = this.imageRect;
    const cx = rect ? rect.x + rect.width / 2 : 0;
    const cy = rect ? rect.y + rect.height / 2 : 0;

    const remainingFronts = [];
    for (const front of this.burnFronts) {
      if (!this.contains(front.x, front.y)) continue;

      // Outside to inside direction toward image center
      const toCenterAngle = Math.atan2(cy - front.y, cx - front.x);

      if (!this.isBurnedAt(front.x, front.y)) {
        this.eraseAt(front.x, front.y, burnRad, { recordFront: false });
        this.emit(front.x, front.y, now);

        // Advance inward toward center
        const advanceSpeed = (2.0 + progressAfter5 * 4.5) * speedMultiplier * 0.35;
        front.x += Math.cos(toCenterAngle) * advanceSpeed + (Math.random() - 0.5) * 2;
        front.y += Math.sin(toCenterAngle) * advanceSpeed - 0.6;
        remainingFronts.push(front);
      } else {
        // Search inward toward center for unburned paper
        let found = false;
        const testAngles = [
          toCenterAngle,
          toCenterAngle - 0.4,
          toCenterAngle + 0.4,
          toCenterAngle - 0.8,
          toCenterAngle + 0.8,
          -Math.PI / 2,
        ];
        const stepDist = burnRad * (0.8 + Math.random() * 0.4);
        for (const baseAngle of testAngles) {
          const angle = baseAngle + (Math.random() - 0.5) * 0.2;
          const testX = front.x + Math.cos(angle) * stepDist;
          const testY = front.y + Math.sin(angle) * stepDist;
          if (this.contains(testX, testY) && !this.isBurnedAt(testX, testY)) {
            front.x = testX;
            front.y = testY;
            front.angle = angle;
            this.eraseAt(front.x, front.y, burnRad, { recordFront: false });
            this.emit(front.x, front.y, now);
            remainingFronts.push(front);
            found = true;
            break;
          }
        }
        if (!found && Math.random() < 0.3) {
          front.x += Math.cos(toCenterAngle) * (stepDist * 1.2) + (Math.random() - 0.5) * 4;
          front.y += Math.sin(toCenterAngle) * (stepDist * 1.2) - 1.0;
          if (this.contains(front.x, front.y)) {
            remainingFronts.push(front);
          }
        }
      }
    }

    // Re-seed embers from unburned areas toward center
    const targetFrontCount = elapsed <= 5000 ? 8 : Math.min(maxFronts, Math.max(6, Math.floor(8 + progressAfter5 * 24)));
    if (remainingFronts.length < targetFrontCount && !this.complete && this.burnedFraction < 0.96) {
      const needed = targetFrontCount - remainingFronts.length;
      const targets = this.getVisibleCalibrationTargets(Math.min(needed, 3));
      if (targets.length > 0 && this.imageRect) {
        for (const t of targets) {
          const tx = rect.x + t.x * rect.width;
          const ty = rect.y + t.y * rect.height;
          const spawnX = tx + (Math.random() - 0.5) * 16;
          const spawnY = ty + (Math.random() - 0.5) * 16;
          if (this.contains(spawnX, spawnY)) {
            remainingFronts.push({ x: spawnX, y: spawnY, angle: Math.atan2(cy - spawnY, cx - spawnX) });
            this.eraseAt(spawnX, spawnY, burnRad * 0.8, { recordFront: false });
            this.emit(spawnX, spawnY, now);
          }
        }
      }
    }

    this.burnFronts = remainingFronts.slice(-maxFronts);
  }

  emit(x, y, now) {
    // 1. Flames (plasma plume with buoyancy acceleration)
    const flameCount = 3 + Math.floor(Math.random() * 2);
    for (let index = 0; index < flameCount; index += 1) {
      this.particles.push({
        kind: "flame",
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 0.45,
        vy: -0.45 - Math.random() * 0.75, // upward convective lift
        ay: -0.0006, // buoyancy acceleration
        curlPhase: Math.random() * Math.PI * 2,
        life: 380 + Math.random() * 380,
        size: 9 + Math.random() * 16,
        born: now,
      });
    }

    // 2. Sparks / flying glowing embers
    const sparkCount = 2 + Math.floor(Math.random() * 2);
    for (let index = 0; index < sparkCount; index += 1) {
      this.particles.push({
        kind: "spark",
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 0.85,
        vy: -1.0 - Math.random() * 1.5, // fast upward pop
        ay: -0.0004,
        curlPhase: Math.random() * Math.PI * 2,
        life: 450 + Math.random() * 650,
        size: 1.4 + Math.random() * 2.2,
        born: now,
      });
    }

    // 3. Smoke (ultra-subtle translucent ash wisp - reduced fog)
    if (Math.random() < 0.08) {
      this.particles.push({
        kind: "smoke",
        x: x + (Math.random() - 0.5) * 12,
        y: y - 6,
        vx: (Math.random() - 0.5) * 0.15,
        vy: -0.25 - Math.random() * 0.3,
        curlPhase: Math.random() * Math.PI * 2,
        life: 500 + Math.random() * 400,
        size: 4 + Math.random() * 6,
        born: now,
      });
    }
  }

  checkCompletion(now = (typeof performance !== "undefined" ? performance.now() : Date.now())) {
    if (!this.image) return false;
    if (this.completionReported) return false;
    if (this.complete) {
      this.completionReported = true;
      return true;
    }

    // Hard completion guarantee within 30 seconds
    if (this.burnStartTime && (now - this.burnStartTime >= this.maxBurnDurationMs)) {
      if (this.maskContext) this.maskContext.clearRect(0, 0, this.mask.width, this.mask.height);
      if (this.scorchContext && this.scorchCanvas) {
        this.scorchContext.clearRect(0, 0, this.scorchCanvas.width, this.scorchCanvas.height);
      }
      this.burnedFraction = 1;
      this.complete = true;
      this.completionReported = true;
      this.burningActive = false;
      this.burnFronts = [];
      if (this.thermoEngine) {
        this.thermoEngine.burn.fill(1.0);
        this.thermoEngine.burnedFraction = 1;
        this.thermoEngine.activeBurningCount = 0;
      }
      return true;
    }

    if (now - this.lastProgressCheck < 600) return false;
    this.lastProgressCheck = now;
    this.monitorContext.clearRect(0, 0, this.monitor.width, this.monitor.height);
    this.monitorContext.drawImage(this.mask, 0, 0, this.monitor.width, this.monitor.height);
    const pixels = this.monitorContext.getImageData(0, 0, this.monitor.width, this.monitor.height).data;
    let remaining = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 18) remaining += 1;
    }
    this.burnedFraction = 1 - remaining / (this.monitor.width * this.monitor.height);
    if (this.thermoEngine) {
      this.burnedFraction = Math.max(this.burnedFraction, this.thermoEngine.burnedFraction);
    }

    // Climactic Flash trigger at >= 92%
    if (this.burnedFraction >= 0.92 && !this.climacticFlashTriggered) {
      this.climacticFlashTriggered = true;
      this.climacticFlashStartTime = now;
      this.spawnClimacticBurst(now);
      this.onClimacticFlash?.();
    }

    const flashDone = this.climacticFlashTriggered && (now - this.climacticFlashStartTime >= this.climacticFlashDurationMs);
    if (flashDone || this.burnedFraction >= 0.98 || remaining <= 8) {
      if (this.maskContext) this.maskContext.clearRect(0, 0, this.mask.width, this.mask.height);
      if (this.scorchContext && this.scorchCanvas) {
        this.scorchContext.clearRect(0, 0, this.scorchCanvas.width, this.scorchCanvas.height);
      }
      this.burnedFraction = 1;
      this.complete = true;
      this.completionReported = true;
      this.burningActive = false;
      this.burnFronts = [];
      if (this.thermoEngine) {
        this.thermoEngine.burn.fill(1.0);
        this.thermoEngine.burnedFraction = 1;
        this.thermoEngine.activeBurningCount = 0;
      }
      return true;
    }
    return false;
  }

  renderEmberGlow(ctx, rect, dpr, now) {
    ctx.save();
    const pulse = 0.85 + Math.sin(now * 0.009) * 0.15;
    for (const front of this.burnFronts) {
      const x = (rect.x + (front.x - rect.x)) * dpr;
      const y = (rect.y + (front.y - rect.y)) * dpr;
      const emberRad = (10 + Math.sin(now * 0.012 + front.x) * 4) * dpr;

      if (typeof ctx.createRadialGradient === "function") {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, emberRad);
        grad.addColorStop(0, `rgba(255, 250, 180, ${0.95 * pulse})`);
        grad.addColorStop(0.3, `rgba(255, 140, 30, ${0.85 * pulse})`);
        grad.addColorStop(0.7, `rgba(220, 40, 10, ${0.5 * pulse})`);
        grad.addColorStop(1, "rgba(180, 20, 0, 0)");
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = `rgba(255, 160, 40, ${0.9 * pulse})`;
      }
      ctx.beginPath();
      ctx.arc(x, y, emberRad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderCompletedAsh(ctx, rect, dpr) {
    if (!ctx || !rect) return;
    ctx.save();
    const rx = rect.x * dpr;
    const ry = rect.y * dpr;
    const rw = rect.width * dpr;
    const rh = rect.height * dpr;

    // 1. Burnt table scorch mark matching the photo footprint
    ctx.fillStyle = "rgba(10, 8, 7, 0.88)";
    ctx.fillRect(rx, ry, rw, rh);

    // 2. Charred fibrous border
    ctx.strokeStyle = "rgba(24, 18, 14, 0.95)";
    ctx.lineWidth = 4 * dpr;
    ctx.strokeRect(rx + 2 * dpr, ry + 2 * dpr, rw - 4 * dpr, rh - 4 * dpr);

    // 3. Realistic carbon ash flakes and scorch texture
    if (!this.ashParticles || this.ashParticles.length === 0) {
      this.ashParticles = [];
      const count = 120;
      for (let i = 0; i < count; i++) {
        this.ashParticles.push({
          x: rx + Math.random() * rw,
          y: ry + Math.random() * rh,
          r: (1.5 + Math.random() * 4.5) * dpr,
          shade: Math.floor(25 + Math.random() * 45),
          alpha: 0.4 + Math.random() * 0.5,
          angle: Math.random() * Math.PI * 2,
        });
      }
    }

    for (const flake of this.ashParticles) {
      ctx.fillStyle = `rgba(${flake.shade}, ${flake.shade}, ${flake.shade}, ${flake.alpha})`;
      ctx.beginPath();
      if (typeof ctx.ellipse === "function") {
        ctx.ellipse(flake.x, flake.y, flake.r, flake.r * 0.5, flake.angle, 0, Math.PI * 2);
      } else {
        ctx.arc(flake.x, flake.y, flake.r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // 4. Subtle charred perimeter crumbles
    ctx.fillStyle = "rgba(18, 14, 12, 0.9)";
    for (let i = 0; i < 30; i++) {
      const edge = i % 4;
      let ex = rx, ey = ry;
      if (edge === 0) { ex = rx + (i / 8) * rw; ey = ry + (Math.random() * 6) * dpr; }
      else if (edge === 1) { ex = rx + (i / 8) * rw; ey = ry + rh - (Math.random() * 6) * dpr; }
      else if (edge === 2) { ex = rx + (Math.random() * 6) * dpr; ey = ry + (i / 8) * rh; }
      else { ex = rx + rw - (Math.random() * 6) * dpr; ey = ry + (i / 8) * rh; }
      ctx.beginPath();
      ctx.arc(ex, ey, (2 + Math.random() * 3) * dpr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  render(now = performance.now()) {
    if (!this.width || !this.height) return;
    const dpr = this.dpr || 1;
    const ctx = this.context;
    if (ctx && this.image && this.imageRect) {
      const rect = this.imageRect;
      const targetW = rect.width * dpr;
      const targetH = rect.height * dpr;
      const targetX = rect.x * dpr;
      const targetY = rect.y * dpr;

      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      // 1. Draw burnt table background underneath photo across entire stage
      if (this.deskImage && this.deskImage.complete && this.deskImage.naturalWidth) {
        try {
          ctx.drawImage(this.deskImage, 0, 0, this.canvas.width, this.canvas.height);
        } catch {}
      } else {
        ctx.fillStyle = "#0c0a09";
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      }

      // If photo is completely burned, show realistic burnt carbon ash footprint!
      if (this.complete || this.burnedFraction >= 0.96) {
        this.renderCompletedAsh(ctx, rect, dpr);
      } else if (this.paperCanvas && this.paperContext) {
        // 2. Prepare charred paper layer on offscreen paperCanvas
        this.paperContext.clearRect(0, 0, this.nativeW, this.nativeH);
        try {
          this.paperContext.drawImage(this.image, 0, 0, this.nativeW, this.nativeH);
        } catch {}

        // Apply thermodynamic paper burn & hole punch
        if (this.thermoEngine && (this.thermoEngine.totalBurned > 0 || this.thermoEngine.activeBurningCount > 0)) {
          this.thermoEngine.applyPaperBurn(this.paperContext, this.nativeW, this.nativeH);
        }

        // Draw paper layer onto photo canvas at targetX, targetY, targetW, targetH preserving natural aspect ratio
        try {
          ctx.drawImage(this.paperCanvas, targetX, targetY, targetW, targetH);
        } catch {}
      } else {
        // Fallback for mock contexts without paperCanvas
        try {
          ctx.drawImage(this.image, targetX, targetY, targetW, targetH);
          if (this.scorchCanvas) ctx.drawImage(this.scorchCanvas, targetX, targetY, targetW, targetH);
          if (this.mask) {
            ctx.globalCompositeOperation = "destination-in";
            ctx.drawImage(this.mask, targetX, targetY, targetW, targetH);
            ctx.globalCompositeOperation = "source-over";
          }
        } catch {}
      }

      // Active incandescent ember glow along burning fronts
      if (this.burningActive && this.burnFronts.length > 0) {
        this.renderEmberGlow(ctx, rect, dpr, now);
      }
    }

    const fire = this.flameContext;
    if (fire) {
      fire.clearRect(0, 0, this.flameCanvas.width, this.flameCanvas.height);

      // Render Eulerian fire sheet, glowing ember rim, and smoke
      if (this.thermoEngine && this.imageRect) {
        const rect = this.imageRect;
        const targetW = rect.width * dpr;
        const targetH = rect.height * dpr;
        const targetX = rect.x * dpr;
        const targetY = rect.y * dpr;

        if (typeof fire.save === "function") {
          fire.save();
          if (typeof fire.translate === "function") fire.translate(targetX, targetY);
          const sX = targetW / this.nativeW;
          const sY = targetH / this.nativeH;
          if (typeof fire.scale === "function") fire.scale(sX, sY);

          // Volumetric smoke plumes & rising ash particles
          this.thermoEngine.renderParticles(fire, { enableSmoke: true, windForce: 0 });

          // Glowing incandescent ember rim along burned edges
          this.thermoEngine.renderGlowingEmberRim(fire, this.nativeW, this.nativeH);

          // Eulerian convective fire sheet (256-color heat palette)
          this.thermoEngine.renderFireSheet(fire, this.nativeW, this.nativeH);

          fire.restore();
        }
      }
      this.particles = this.particles.filter((particle) => now - particle.born < particle.life);

      // Render subtle, translucent ash wisps without heavy blur or fog
      for (const particle of this.particles) {
        if (particle.kind !== "smoke") continue;
        const age = now - particle.born;
        const fraction = age / particle.life;
        const x = particle.x + particle.vx * age + Math.sin(age * 0.005 + particle.curlPhase) * 6;
        const y = particle.y + particle.vy * age;
        const radius = particle.size * (0.6 + fraction * 1.3) * dpr;

        fire.save();
        if (typeof fire.createRadialGradient === "function") {
          const smoke = fire.createRadialGradient(x * dpr, y * dpr, 0, x * dpr, y * dpr, radius);
          smoke.addColorStop(0, `rgba(45, 40, 38, ${0.06 * (1 - fraction)})`);
          smoke.addColorStop(0.5, `rgba(35, 30, 28, ${0.03 * (1 - fraction)})`);
          smoke.addColorStop(1, "rgba(25, 20, 18, 0)");
          fire.fillStyle = smoke;
        } else {
          fire.fillStyle = `rgba(45, 40, 38, ${0.04 * (1 - fraction)})`;
        }
        fire.beginPath();
        fire.arc(x * dpr, y * dpr, radius, 0, Math.PI * 2);
        fire.fill();
        fire.restore();
      }

      // Render flames with additive blending ("lighter") so overlapping flames create blazing hot white cores!
      fire.save();
      fire.globalCompositeOperation = "lighter";
      for (const particle of this.particles) {
        if (particle.kind !== "flame") continue;
        const age = now - particle.born;
        const fraction = age / particle.life;
        const ay = particle.ay || -0.0006;
        const y = particle.y + particle.vy * age + 0.5 * ay * age * age;
        const curl = Math.sin(age * 0.014 + particle.curlPhase) * (particle.size * 0.45 * fraction);
        const x = particle.x + particle.vx * age + curl;

        const width = particle.size * (0.85 - fraction * 0.4) * dpr;
        const height = width * (2.4 + (1 - fraction) * 1.5);

        fire.save();
        fire.translate(x * dpr, y * dpr);
        fire.rotate(particle.vx * age * 0.0025 + Math.sin(age * 0.012 + particle.curlPhase) * 0.2);

        if (typeof fire.createLinearGradient === "function") {
          const flame = fire.createLinearGradient(0, height * 0.4, 0, -height);
          flame.addColorStop(0, `rgba(255, 255, 220, ${0.98 * (1 - fraction)})`); // white-hot incandescent core
          flame.addColorStop(0.18, `rgba(255, 205, 70, ${0.94 * (1 - fraction)})`); // radiant yellow
          flame.addColorStop(0.52, `rgba(255, 90, 20, ${0.88 * (1 - fraction)})`); // fiery orange
          flame.addColorStop(0.85, `rgba(210, 30, 10, ${0.65 * (1 - fraction)})`); // deep ember red
          flame.addColorStop(1, "rgba(140, 15, 0, 0)");
          fire.fillStyle = flame;
        } else {
          fire.fillStyle = `rgba(255, 140, 30, ${0.9 * (1 - fraction)})`;
        }
        fire.beginPath();
        fire.moveTo(-width * 0.5, height * 0.3);
        if (typeof fire.quadraticCurveTo === "function") {
          fire.quadraticCurveTo(-width * 0.95, -height * 0.2, 0, -height);
          fire.quadraticCurveTo(width * 0.9, -height * 0.2, width * 0.5, height * 0.3);
          fire.quadraticCurveTo(width * 0.2, height * 0.55, 0, height * 0.38);
          fire.quadraticCurveTo(-width * 0.22, height * 0.52, -width * 0.5, height * 0.3);
        } else {
          fire.arc(0, 0, width, 0, Math.PI * 2);
        }
        fire.fill();
        fire.restore();
      }
      fire.restore();

      // Render sparks / flying glowing embers on top
      for (const particle of this.particles) {
        if (particle.kind !== "spark") continue;
        const age = now - particle.born;
        const fraction = age / particle.life;
        const ay = particle.ay || -0.0004;
        const y = particle.y + particle.vy * age + 0.5 * ay * age * age;
        const wobble = Math.sin(age * 0.02 + particle.curlPhase) * 5;
        const x = particle.x + particle.vx * age + wobble;
        const sparkRad = Math.max(0.6, particle.size * (1 - fraction * 0.6)) * dpr;

        fire.save();
        fire.fillStyle = `rgba(255, ${Math.round(240 - fraction * 140)}, ${Math.round(140 - fraction * 120)}, ${1 - fraction * 0.7})`;
        fire.beginPath();
        fire.arc(x * dpr, y * dpr, sparkRad, 0, Math.PI * 2);
        fire.fill();
        fire.restore();
      }

      // Climactic Flash flare: intense incandescent white/amber burst across photo
      if (this.climacticFlashTriggered && this.imageRect) {
        const age = now - this.climacticFlashStartTime;
        if (age >= 0 && age < this.climacticFlashDurationMs) {
          let intensity = 0;
          if (age < 180) {
            intensity = (age / 180) * 0.95;
          } else {
            intensity = 0.95 * Math.pow(Math.max(0, 1 - (age - 180) / (this.climacticFlashDurationMs - 180)), 1.8);
          }
          if (intensity > 0.01) {
            const rect = this.imageRect;
            const cx = (rect.x + rect.width / 2) * dpr;
            const cy = (rect.y + rect.height / 2) * dpr;
            const maxR = Math.hypot(rect.width, rect.height) * 0.65 * dpr;
            fire.save();
            fire.globalCompositeOperation = "lighter";
            if (typeof fire.createRadialGradient === "function") {
              const grad = fire.createRadialGradient(cx, cy, 0, cx, cy, maxR);
              grad.addColorStop(0, `rgba(255, 255, 255, ${intensity})`);
              grad.addColorStop(0.22, `rgba(255, 245, 200, ${intensity * 0.92})`);
              grad.addColorStop(0.55, `rgba(255, 160, 40, ${intensity * 0.65})`);
              grad.addColorStop(0.85, `rgba(220, 50, 10, ${intensity * 0.3})`);
              grad.addColorStop(1, "rgba(180, 20, 0, 0)");
              fire.fillStyle = grad;
              fire.fillRect(rect.x * dpr, rect.y * dpr, rect.width * dpr, rect.height * dpr);
            }
            fire.restore();
          }
        }
      }
    }
  }

  spawnClimacticBurst(now) {
    const rect = this.imageRect || { x: 0, y: 0, width: this.width || 400, height: this.height || 300 };
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const sparkCount = 36;
    for (let i = 0; i < sparkCount; i++) {
      const angle = (i / sparkCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const speed = 2.0 + Math.random() * 4.5;
      this.particles.push({
        kind: "spark",
        x: cx + (Math.random() - 0.5) * (rect.width * 0.4),
        y: cy + (Math.random() - 0.5) * (rect.height * 0.4),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.4,
        ay: -0.0003,
        curlPhase: Math.random() * Math.PI * 2,
        life: 550 + Math.random() * 450,
        size: 2.2 + Math.random() * 3.0,
        born: now,
      });
    }
  }

  clearFlames() {
    this.particles = [];
    if (this.flameCanvas && this.flameContext) {
      this.flameContext.clearRect(0, 0, this.flameCanvas.width, this.flameCanvas.height);
    }
  }

  reset() {
    if (this.image) {
      this.load(this.image);
    } else {
      this.particles = [];
      this.burnFronts = [];
      this.burningActive = false;
      this.lastStepBurnAt = 0;
      this.burnedFraction = 0;
      this.complete = false;
      this.completionReported = false;
      this.burnStartTime = 0;
      this.climacticFlashTriggered = false;
      this.climacticFlashStartTime = 0;
      this.ashParticles = null;
      this.simulatedElapsed = 0;
      if (this.thermoEngine) {
        this.thermoEngine.reset();
      }
    }
  }

  destroy() {
    this.resizeObserver?.disconnect();
    this.particles = [];
    this.burnFronts = [];
    this.burningActive = false;
    this.scorchCanvas = null;
    this.scorchContext = null;
    this.image = null;
  }
}
