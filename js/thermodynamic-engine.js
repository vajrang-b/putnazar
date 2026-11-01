/**
 * Thermodynamic Combustion & Fluid Fire Physics Engine
 *
 * Implements:
 * - 2D Eulerian fluid grid for combustion thermodynamics (temperature diffusion & convective heat rising)
 * - 256-color thermal plasma palette (charcoal red -> fiery orange -> bright yellow -> white hot)
 * - Fuel consumption and paper charring / hole punch mask
 * - Volumetric billowing smoke puffs with radial gradients
 * - Quadratic bezier curve licking flame tongues with incandescent white cores
 * - High-velocity spark embers
 * - Targeted eye ignition & presets (Center, Bottom edge, Corner, All edges)
 */

export const DEFAULT_GRID_WIDTH = 180;
export const DEFAULT_GRID_HEIGHT = 241;

export function createFirePalette() {
  const palette = [];
  for (let i = 0; i < 256; i++) {
    let r, g, b, a;
    if (i < 12) {
      r = i * 14;
      g = 0;
      b = 0;
      a = (i / 12) * 0.3;
    } else if (i < 55) {
      const t = (i - 12) / 43;
      r = Math.floor(168 + t * 87);
      g = Math.floor(t * 60);
      b = 0;
      a = 0.3 + t * 0.45;
    } else if (i < 145) {
      const t = (i - 55) / 90;
      r = 255;
      g = Math.floor(60 + t * 155);
      b = Math.floor(t * 15);
      a = 0.75 + t * 0.25;
    } else {
      const t = (i - 145) / 110;
      r = 255;
      g = Math.floor(215 + t * 40);
      b = Math.floor(15 + t * 240);
      a = 1.0;
    }
    palette.push([r, g, b, a]);
  }
  return palette;
}

export class VolumetricSmokePuff {
  constructor(x, y, windForce = 0) {
    this.x = x + (Math.random() - 0.5) * 8;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 0.8 + windForce * 0.25;
    this.vy = -(2.5 + Math.random() * 3.5);
    this.size = 4 + Math.random() * 6;
    this.maxSize = this.size + 10 + Math.random() * 12;
    this.life = 1.0;
    this.decay = 0.025 + Math.random() * 0.02;
    const tone = Math.floor(45 + Math.random() * 25);
    this.color = `${tone}, ${tone - 4}, ${tone - 8}`;
    this.angle = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 0.04;
  }

  update(windForce = 0) {
    this.x += this.vx;
    this.y += this.vy;
    this.vx += windForce * 0.01 + (Math.random() - 0.5) * 0.15;
    this.vy *= 0.985;
    this.size = Math.min(this.maxSize, this.size + 0.35);
    this.angle += this.rotSpeed;
    this.life -= this.decay;
  }

  draw(c) {
    if (this.life <= 0 || !c || typeof c.beginPath !== "function") return;
    c.save();
    // Ultra-light, translucent wispy ash (reduced fog opacity to keep photo clearly visible)
    const alpha = Math.sin(this.life * Math.PI) * 0.07;
    const rad = this.size;

    if (typeof c.createRadialGradient === "function") {
      const grad = c.createRadialGradient(this.x, this.y, 0, this.x, this.y, rad);
      grad.addColorStop(0, `rgba(${this.color}, ${alpha})`);
      grad.addColorStop(0.5, `rgba(${this.color}, ${alpha * 0.6})`);
      grad.addColorStop(1, `rgba(${this.color}, 0)`);
      c.fillStyle = grad;
    } else {
      c.fillStyle = `rgba(${this.color}, ${alpha * 0.5})`;
    }

    c.beginPath();
    c.arc(this.x, this.y, rad, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

export class FlameTongue {
  constructor(x, y, flameMultiplier = 1.2) {
    this.x = x;
    this.y = y;
    this.baseWidth = (8 + Math.random() * 14) * flameMultiplier;
    this.height = (25 + Math.random() * 45) * flameMultiplier;
    this.life = 1.0;
    this.decay = 0.06 + Math.random() * 0.07;
    this.curve = (Math.random() - 0.5) * 15;
  }

  update() {
    this.life -= this.decay;
    this.y -= 2.0;
  }

  draw(c, windForce = 0) {
    if (this.life <= 0 || !c || typeof c.moveTo !== "function") return;
    c.save();
    c.globalCompositeOperation = "lighter";
    const h = this.height * (0.5 + this.life * 0.5);
    const w = this.baseWidth * this.life;
    const tipX = this.x + this.curve + windForce * (h * 0.25);
    const tipY = this.y - h;

    // Outer flame body
    c.beginPath();
    c.moveTo(this.x - w / 2, this.y);
    if (typeof c.quadraticCurveTo === "function") {
      c.quadraticCurveTo(this.x - w * 0.3, this.y - h * 0.5, tipX, tipY);
      c.quadraticCurveTo(this.x + w * 0.3, this.y - h * 0.5, this.x + w / 2, this.y);
    } else {
      c.lineTo(tipX, tipY);
      c.lineTo(this.x + w / 2, this.y);
    }
    c.closePath();
    c.fillStyle = `rgba(255, 95, 10, ${0.75 * this.life})`;
    c.fill();

    // Inner incandescent white-hot flame core
    c.beginPath();
    c.moveTo(this.x - w * 0.25, this.y);
    if (typeof c.quadraticCurveTo === "function") {
      c.quadraticCurveTo(this.x, this.y - h * 0.4, tipX * 0.8 + this.x * 0.2, tipY + h * 0.3);
      c.quadraticCurveTo(this.x + w * 0.25, this.y - h * 0.4, this.x + w * 0.25, this.y);
    } else {
      c.lineTo(tipX * 0.8 + this.x * 0.2, tipY + h * 0.3);
      c.lineTo(this.x + w * 0.25, this.y);
    }
    c.closePath();
    c.fillStyle = `rgba(255, 245, 180, ${0.9 * this.life})`;
    c.fill();

    c.restore();
  }
}

export class EmberParticle {
  constructor(x, y, windForce = 0) {
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 3.5 + windForce * 0.35;
    this.vy = -(3.0 + Math.random() * 5.0);
    this.size = 1.5 + Math.random() * 2.5;
    this.life = 0.5 + Math.random() * 0.5;
    this.maxLife = this.life;
  }

  update() {
    this.x += this.vx + Math.sin(this.y * 0.05) * 0.8;
    this.y += this.vy;
    this.life -= 0.016;
  }

  draw(c) {
    if (this.life <= 0 || !c || typeof c.beginPath !== "function") return;
    c.save();
    if (c.shadowBlur !== undefined) {
      c.shadowBlur = 8;
      c.shadowColor = "#ff6600";
    }
    const alpha = Math.max(0, this.life / this.maxLife);
    c.fillStyle = `rgba(255, ${Math.floor(170 + Math.random() * 80)}, 30, ${alpha})`;
    c.beginPath();
    c.arc(this.x, this.y, this.size * alpha, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

export class ThermodynamicFireEngine {
  constructor(options = {}) {
    this.gridW = options.gridW || DEFAULT_GRID_WIDTH;
    this.gridH = options.gridH || DEFAULT_GRID_HEIGHT;
    this.totalCells = this.gridW * this.gridH;
    this.nativeW = options.nativeW || 720;
    this.nativeH = options.nativeH || 964;
    this.scaleX = this.nativeW / this.gridW;
    this.scaleY = this.nativeH / this.gridH;

    this.temp = new Float32Array(this.totalCells);
    this.tempNext = new Float32Array(this.totalCells);
    this.burn = new Float32Array(this.totalCells);
    this.fireGrid = new Uint8ClampedArray(this.totalCells);

    this.firePalette = createFirePalette();

    const createCanvas = options.createCanvas || (() => (typeof document !== "undefined" ? document.createElement("canvas") : null));
    this.fireCanvas = createCanvas();
    if (this.fireCanvas) {
      this.fireCanvas.width = this.gridW;
      this.fireCanvas.height = this.gridH;
      this.fireCtx = this.fireCanvas.getContext?.("2d");
      this.fireImageData = this.fireCtx?.createImageData?.(this.gridW, this.gridH) || null;
    } else {
      this.fireCtx = null;
      this.fireImageData = null;
    }

    this.smokePuffs = [];
    this.embers = [];
    this.flameTongues = [];

    this.activeBurningCount = 0;
    this.totalBurned = 0;
    this.burnedFraction = 0;
    this.burnStartTime = 0;
    this.maxBurnDurationMs = options.maxBurnDurationMs || 30000;
    this.climacticFlashTriggered = false;
    this.climacticFlashStartTime = 0;
    this.climacticFlashDurationMs = 900;
  }

  setDimensions(nativeW, nativeH) {
    this.nativeW = nativeW;
    this.nativeH = nativeH;
    this.scaleX = this.nativeW / this.gridW;
    this.scaleY = this.nativeH / this.gridH;
  }

  reset() {
    this.temp.fill(0);
    this.tempNext.fill(0);
    this.burn.fill(0);
    this.fireGrid.fill(0);
    this.smokePuffs.length = 0;
    this.flameTongues.length = 0;
    this.embers.length = 0;
    this.activeBurningCount = 0;
    this.totalBurned = 0;
    this.burnedFraction = 0;
    this.burnStartTime = 0;
    this.cachedAsh = null;
    this.climacticFlashTriggered = false;
    this.climacticFlashStartTime = 0;
  }

  igniteCircle(cx, cy, radius = 6, initialHeat = 2.0) {
    if (!this.burnStartTime) this.burnStartTime = performance.now();
    const minX = Math.max(0, Math.floor(cx - radius));
    const maxX = Math.min(this.gridW - 1, Math.ceil(cx + radius));
    const minY = Math.max(0, Math.floor(cy - radius));
    const maxY = Math.min(this.gridH - 1, Math.ceil(cy + radius));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= radius * radius) {
          const idx = y * this.gridW + x;
          if (this.burn[idx] < 0.8) {
            this.temp[idx] = Math.max(this.temp[idx], initialHeat);
            this.fireGrid[idx] = 255;
          }
        }
      }
    }

    const canvasX = cx * this.scaleX;
    const canvasY = cy * this.scaleY;
    for (let i = 0; i < 3; i++) {
      this.embers.push(new EmberParticle(canvasX, canvasY));
    }
    this.smokePuffs.push(new VolumetricSmokePuff(canvasX, canvasY));
  }

  igniteNormalized(nx, ny, radius = 6, initialHeat = 2.0) {
    const cx = Math.max(0, Math.min(this.gridW - 1, nx * this.gridW));
    const cy = Math.max(0, Math.min(this.gridH - 1, ny * this.gridH));
    this.igniteCircle(cx, cy, radius, initialHeat);
  }

  /**
   * Eye Socket Ignition
   * Default coordinates calibrated for standard portrait alignment:
   * Left eye (viewer's perspective): ~55.5% X, ~34.4% Y
   * Right eye (viewer's perspective): ~66.7% X, ~35.6% Y
   */
  igniteEyes(leftEye = { x: 0.555, y: 0.344 }, rightEye = { x: 0.667, y: 0.356 }, radius = 7) {
    const leftGridX = leftEye.x * this.gridW;
    const leftGridY = leftEye.y * this.gridH;
    const rightGridX = rightEye.x * this.gridW;
    const rightGridY = rightEye.y * this.gridH;

    this.igniteCircle(leftGridX, leftGridY, radius, 2.2);
    this.igniteCircle(rightGridX, rightGridY, radius, 2.2);

    for (let i = 0; i < 6; i++) {
      this.embers.push(new EmberParticle(leftGridX * this.scaleX, leftGridY * this.scaleY));
      this.embers.push(new EmberParticle(rightGridX * this.scaleX, rightGridY * this.scaleY));
    }
    this.smokePuffs.push(new VolumetricSmokePuff(leftGridX * this.scaleX, leftGridY * this.scaleY));
    this.smokePuffs.push(new VolumetricSmokePuff(rightGridX * this.scaleX, rightGridY * this.scaleY));
  }

  ignitePreset(type) {
    switch (type) {
      case "eyes":
        this.igniteEyes();
        break;
      case "center":
        this.igniteCircle(this.gridW * 0.5, this.gridH * 0.45, 11, 2.0);
        break;
      case "bottom":
        for (let x = 0; x < this.gridW; x++) {
          const idx = (this.gridH - 2) * this.gridW + x;
          this.temp[idx] = 1.8 + Math.random() * 0.4;
          this.fireGrid[idx] = 255;
        }
        break;
      case "corner":
        this.igniteCircle(this.gridW - 10, this.gridH - 10, 12, 2.0);
        break;
      case "perimeter":
      case "all":
        this.ignitePerimeter(1.6);
        break;
      default:
        break;
    }
  }

  ignitePerimeter(initialHeat = 1.6) {
    if (!this.burnStartTime) {
      this.burnStartTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    }
    // Ignite all 4 outer borders (burn from outside to inside)
    for (let x = 0; x < this.gridW; x++) {
      this.temp[x] = Math.max(this.temp[x], initialHeat);
      this.fireGrid[x] = 255;
      const bottomIdx = (this.gridH - 1) * this.gridW + x;
      this.temp[bottomIdx] = Math.max(this.temp[bottomIdx], initialHeat);
      this.fireGrid[bottomIdx] = 255;
    }
    for (let y = 0; y < this.gridH; y++) {
      const leftIdx = y * this.gridW;
      this.temp[leftIdx] = Math.max(this.temp[leftIdx], initialHeat);
      this.fireGrid[leftIdx] = 255;
      const rightIdx = y * this.gridW + (this.gridW - 1);
      this.temp[rightIdx] = Math.max(this.temp[rightIdx], initialHeat);
      this.fireGrid[rightIdx] = 255;
    }
    this.activeBurningCount = (this.gridW + this.gridH) * 2;
  }

  step(options = {}) {
    const burnSpeed = options.burnSpeed ?? 1.0;
    const windForce = options.windForce ?? 0.0;
    const flameMultiplier = options.flameMultiplier ?? 1.2;
    const smokeDensity = options.smokeDensity ?? 0.25;
    const enableSmoke = options.enableSmoke ?? true;

    // Advance clock (supporting real browser time & synchronous test loops)
    const realNow = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (options.now !== undefined) {
      this.currentTime = options.now;
    } else if (this.lastStepRealTime && realNow - this.lastStepRealTime < 5) {
      // Step called in tight synchronous loop (e.g. tests): advance 16.67ms per step
      this.currentTime = (this.currentTime || realNow) + 16.67;
    } else {
      this.currentTime = realNow;
    }
    this.lastStepRealTime = realNow;
    const now = this.currentTime;

    if (!this.burnStartTime && (this.activeBurningCount > 0 || this.totalBurned > 0)) {
      this.burnStartTime = now;
    }

    // Natural burn progression:
    // Normal in initial 5 seconds, then continuously incrementing!
    let speedMultiplier = 1.0;
    if (this.burnStartTime) {
      const elapsedSec = Math.max(0, (now - this.burnStartTime) / 1000);
      if (elapsedSec <= 5.0) {
        speedMultiplier = 0.06;
      } else {
        const p = Math.min(1.0, (elapsedSec - 5.0) / 23.0);
        speedMultiplier = 0.06 + Math.pow(p, 1.6) * 1.0;
      }
      const progress = Math.min(1.0, (elapsedSec * 1000) / this.maxBurnDurationMs);
      if (elapsedSec >= this.maxBurnDurationMs / 1000 || progress >= 1.0 || this.burnedFraction >= 0.98) {
        this.burn.fill(1.0);
        this.temp.fill(0);
        this.fireGrid.fill(0);
        this.totalBurned = this.totalCells;
        this.burnedFraction = 1.0;
        this.activeBurningCount = 0;
        return 1.0;
      }

      // Climactic Flash check at >= 92%
      if (this.burnedFraction >= 0.92) {
        if (!this.climacticFlashTriggered) {
          this.climacticFlashTriggered = true;
          this.climacticFlashStartTime = now;
          const cx = this.gridW * 0.5 * this.scaleX;
          const cy = this.gridH * 0.5 * this.scaleY;
          for (let i = 0; i < 24; i++) {
            this.embers.push(new EmberParticle(cx + (Math.random() - 0.5) * 60, cy + (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 2));
          }
        }
        speedMultiplier = Math.max(speedMultiplier, 4.0);
        if (now - this.climacticFlashStartTime >= this.climacticFlashDurationMs) {
          this.burn.fill(1.0);
          this.temp.fill(0);
          this.fireGrid.fill(0);
          this.totalBurned = this.totalCells;
          this.burnedFraction = 1.0;
          this.activeBurningCount = 0;
          return 1.0;
        }
      }
    }

    this.activeBurningCount = 0;
    this.totalBurned = 0;
    const rate = (options.rate ?? 0.0035) * burnSpeed * speedMultiplier;
    const cooling = 0.94;
    const windOffset = Math.round(windForce * 0.25);

    // 1. Combustion step: consume fuel, generate heat, conduct to adjacent fuel, spawn particles
    for (let y = 0; y < this.gridH; y++) {
      const yOffset = y * this.gridW;
      const yUp = Math.max(0, y - 1);
      const yDown = Math.min(this.gridH - 1, y + 1);

      for (let x = 0; x < this.gridW; x++) {
        const idx = yOffset + x;
        const currentBurn = this.burn[idx];
        this.totalBurned += currentBurn;

        const fuel = Math.max(0.0, 1.0 - currentBurn);
        let currentTemp = this.temp[idx];

        if (currentTemp > 0.22 && fuel > 0.02) {
          this.activeBurningCount++;
          const combustion = Math.min(fuel, rate * (currentTemp + 0.25));
          this.burn[idx] += combustion;
          currentTemp += combustion * 1.2;

          // Conductive and radiant heat transfer into adjacent unburned fuel
          const xLeft = Math.max(0, x - 1);
          const xRight = Math.min(this.gridW - 1, x + 1);
          const rad = combustion * 0.35;
          this.temp[yOffset + xLeft] += rad;
          this.temp[yOffset + xRight] += rad;
          this.temp[yUp * this.gridW + x] += rad * 1.05;
          this.temp[yDown * this.gridW + x] += rad * 0.95;

          const fireIntensity = Math.min(255, Math.floor(190 + currentTemp * 35));
          this.fireGrid[idx] = fireIntensity;

          const canvasX = (x + Math.random()) * this.scaleX;
          const canvasY = (y + Math.random()) * this.scaleY;

          if (Math.random() < 0.25 * flameMultiplier) {
            this.flameTongues.push(new FlameTongue(canvasX, canvasY, flameMultiplier));
          }

          if (enableSmoke && Math.random() < 0.025 * smokeDensity) {
            this.smokePuffs.push(new VolumetricSmokePuff(canvasX, canvasY - 10, windForce));
          }

          if (Math.random() < 0.1) {
            this.embers.push(new EmberParticle(canvasX, canvasY, windForce));
          }
        } else if (fuel <= 0.02) {
          currentTemp *= 0.85;
        }

        this.temp[idx] = currentTemp;
      }
    }

    // 2. Heat diffusion with inward conduction toward center & upward convection
    const centerX = this.gridW / 2;
    const centerY = this.gridH / 2;
    for (let y = 0; y < this.gridH; y++) {
      const yUp = Math.max(0, y - 1);
      const yDown = Math.min(this.gridH - 1, y + 1);
      const biasY = ((centerY - y) / this.gridH) * 0.05;

      for (let x = 0; x < this.gridW; x++) {
        const xLeft = Math.max(0, x - 1);
        const xRight = Math.min(this.gridW - 1, x + 1);
        const xWind = Math.max(0, Math.min(this.gridW - 1, x - windOffset));
        const biasX = ((centerX - x) / this.gridW) * 0.05;

        const idx = y * this.gridW + x;
        const selfTemp = this.temp[idx];

        // Outside-to-inside thermal conduction bias
        const heatFromBelow = this.temp[yDown * this.gridW + x] * Math.max(0.05, 0.22 - biasY);
        const heatFromAbove = this.temp[yUp * this.gridW + x] * Math.max(0.05, 0.14 + biasY);
        const heatFromLeft = this.temp[y * this.gridW + xLeft] * Math.max(0.05, 0.18 - biasX);
        const heatFromRight = this.temp[y * this.gridW + xRight] * Math.max(0.05, 0.18 + biasX);
        const heatFromWind = this.temp[y * this.gridW + xWind] * 0.08;

        const newTemp = (selfTemp * 0.38 + heatFromBelow + heatFromAbove + heatFromLeft + heatFromRight + heatFromWind) * cooling;
        this.tempNext[idx] = Math.min(2.5, newTemp);
      }
    }

    const tmp = this.temp;
    this.temp = this.tempNext;
    this.tempNext = tmp;

    // 3. Convective Eulerian fire advection (fire rises with sway and decay)
    const windShift = Math.round(windForce * 0.35);
    for (let y = 0; y < this.gridH - 1; y++) {
      const yOffset = y * this.gridW;
      const belowOffset = (y + 1) * this.gridW;
      for (let x = 0; x < this.gridW; x++) {
        const randSway = Math.floor((Math.random() - 0.5) * 3) + windShift;
        const srcX = Math.max(0, Math.min(this.gridW - 1, x + randSway));
        const srcVal = this.fireGrid[belowOffset + srcX];
        const decay = Math.floor(Math.random() * 9) + 4;
        this.fireGrid[yOffset + x] = Math.max(0, srcVal - decay);
      }
    }

    this.burnedFraction = this.totalBurned / this.totalCells;
    return this.burnedFraction;
  }

  isBurnedAt(canvasX, canvasY, threshold = 0.45) {
    const gx = Math.min(this.gridW - 1, Math.max(0, Math.floor(canvasX / this.scaleX)));
    const gy = Math.min(this.gridH - 1, Math.max(0, Math.floor(canvasY / this.scaleY)));
    return this.burn[gy * this.gridW + gx] >= threshold;
  }

  applyPaperBurn(paperCtx, nativeW, nativeH) {
    if (!paperCtx || typeof paperCtx.getImageData !== "function") return;
    try {
      const paperImageData = paperCtx.getImageData(0, 0, nativeW, nativeH);
      const data = paperImageData.data;

      for (let y = 0; y < nativeH; y++) {
        const gy = Math.min(this.gridH - 1, Math.floor(y / this.scaleY));
        const gyOffset = gy * this.gridW;
        const rowOffset = y * nativeW * 4;

        for (let x = 0; x < nativeW; x++) {
          const gx = Math.min(this.gridW - 1, Math.floor(x / this.scaleX));
          const gIdx = gyOffset + gx;
          const bVal = this.burn[gIdx];

          if (bVal > 0.02) {
            const pIdx = rowOffset + x * 4;
            if (bVal >= 0.40) {
              data[pIdx + 3] = 0; // Punched hole through paper
            } else {
              // High-contrast charred carbon rim to make photo burning vividly visible
              const charFactor = Math.min(1.0, bVal * 2.5);
              data[pIdx] = Math.floor(data[pIdx] * (1.0 - charFactor * 0.90));
              data[pIdx + 1] = Math.floor(data[pIdx + 1] * (1.0 - charFactor * 0.94));
              data[pIdx + 2] = Math.floor(data[pIdx + 2] * (1.0 - charFactor * 0.96));
            }
          }
        }
      }

      paperCtx.putImageData(paperImageData, 0, 0);
    } catch (err) {
      // Gracefully preserve intact paper layer if canvas is tainted or context error
    }
  }

  renderFireSheet(ctx, nativeW, nativeH) {
    if (!ctx || !this.fireCtx || !this.fireImageData || this.activeBurningCount <= 0) return;
    const fData = this.fireImageData.data;
    for (let i = 0; i < this.totalCells; i++) {
      const heat = this.fireGrid[i];
      if (heat < 18) {
        fData[i * 4 + 3] = 0;
        continue;
      }
      const color = this.firePalette[heat];
      const p4 = i * 4;
      fData[p4] = color[0];
      fData[p4 + 1] = color[1];
      fData[p4 + 2] = color[2];
      fData[p4 + 3] = Math.floor(color[3] * 210);
    }
    this.fireCtx.putImageData(this.fireImageData, 0, 0);

    ctx.save();
    // Additive luminous blending so flames glow without milky screen fog
    ctx.globalCompositeOperation = "lighter";
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fireCanvas, 0, 0, nativeW, nativeH);
    ctx.restore();
  }

  renderGlowingEmberRim(ctx, nativeW, nativeH) {
    if (!ctx || this.activeBurningCount <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let y = 0; y < this.gridH; y += 2) {
      const gyOffset = y * this.gridW;
      for (let x = 0; x < this.gridW; x += 2) {
        const idx = gyOffset + x;
        const b = this.burn[idx];
        const t = this.temp[idx];
        if (b > 0.08 && b < 0.70 && t > 0.20) {
          const cx = x * this.scaleX;
          const cy = y * this.scaleY;
          const glowAlpha = Math.min(1.0, (t - 0.15) * 1.8);
          const flicker = 0.85 + Math.random() * 0.3;

          ctx.fillStyle = `rgba(255, ${Math.floor(100 + Math.random() * 110)}, 20, ${0.75 * glowAlpha * flicker})`;
          ctx.beginPath();
          ctx.arc(cx, cy, 5.5 * this.scaleX, 0, Math.PI * 2);
          ctx.fill();

          if (t > 0.45) {
            ctx.fillStyle = `rgba(255, 250, 220, ${0.95 * glowAlpha})`;
            ctx.beginPath();
            ctx.arc(cx, cy, 2.5 * this.scaleX, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
    ctx.restore();
  }

  renderCompletedAsh(ctx, nativeW, nativeH) {
    if (!ctx) return;
    ctx.save();
    // 1. Burnt table carbon shadow
    ctx.fillStyle = "rgba(10, 8, 7, 0.88)";
    ctx.fillRect(0, 0, nativeW, nativeH);

    // 2. Heavy char edge
    ctx.strokeStyle = "rgba(22, 16, 12, 0.95)";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, nativeW - 6, nativeH - 6);

    // 3. Ash flake dust
    if (!this.cachedAsh) {
      this.cachedAsh = [];
      for (let i = 0; i < 150; i++) {
        this.cachedAsh.push({
          x: Math.random() * nativeW,
          y: Math.random() * nativeH,
          r: 2 + Math.random() * 5,
          color: Math.random() > 0.4 ? "rgba(45, 42, 40, 0.75)" : "rgba(80, 75, 70, 0.55)",
          angle: Math.random() * Math.PI * 2,
        });
      }
    }
    for (const p of this.cachedAsh) {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.5, p.angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  renderParticles(ctx, options = {}) {
    const enableSmoke = options.enableSmoke ?? true;
    const windForce = options.windForce ?? 0;

    // 1. Smoke Plumes
    if (enableSmoke && this.smokePuffs.length > 0) {
      for (let i = this.smokePuffs.length - 1; i >= 0; i--) {
        const s = this.smokePuffs[i];
        s.update(windForce);
        s.draw(ctx);
        if (s.life <= 0) this.smokePuffs.splice(i, 1);
      }
    }

    // 2. Flame Tongues
    if (this.flameTongues.length > 0) {
      for (let i = this.flameTongues.length - 1; i >= 0; i--) {
        const ft = this.flameTongues[i];
        ft.update();
        ft.draw(ctx, windForce);
        if (ft.life <= 0) this.flameTongues.splice(i, 1);
      }
    }

    // 3. Embers
    if (this.embers.length > 0) {
      for (let i = this.embers.length - 1; i >= 0; i--) {
        const e = this.embers[i];
        e.update();
        e.draw(ctx);
        if (e.life <= 0) this.embers.splice(i, 1);
      }
    }
  }
}

