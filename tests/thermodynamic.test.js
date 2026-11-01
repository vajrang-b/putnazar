import test from "node:test";
import assert from "node:assert/strict";
import {
  createFirePalette,
  ThermodynamicFireEngine,
  FlameTongue,
  VolumetricSmokePuff,
  EmberParticle,
} from "../js/thermodynamic-engine.js";

test("createFirePalette returns 256 color gradient array", () => {
  const palette = createFirePalette();
  assert.equal(palette.length, 256);
  // Bottom: dark transparent
  assert.equal(palette[0][0], 0);
  assert.equal(palette[0][3], 0);
  // Mid: fiery orange/red
  assert.ok(palette[100][0] > 200);
  // Top: white hot
  assert.equal(palette[255][0], 255);
  assert.equal(palette[255][1], 255);
  assert.equal(palette[255][2], 255);
  assert.equal(palette[255][3], 1.0);
});

test("ThermodynamicFireEngine initializes with default grid and buffers", () => {
  const engine = new ThermodynamicFireEngine();
  assert.equal(engine.gridW, 180);
  assert.equal(engine.gridH, 241);
  assert.equal(engine.totalCells, 180 * 241);
  assert.equal(engine.temp.length, engine.totalCells);
  assert.equal(engine.burn.length, engine.totalCells);
  assert.equal(engine.fireGrid.length, engine.totalCells);
  assert.equal(engine.activeBurningCount, 0);
  assert.equal(engine.burnedFraction, 0);
});

test("ThermodynamicFireEngine ignites circles and eye sockets", () => {
  const engine = new ThermodynamicFireEngine();
  engine.igniteCircle(90, 120, 5, 2.0);

  // Check temperature at center
  const centerIdx = 120 * engine.gridW + 90;
  assert.ok(engine.temp[centerIdx] >= 2.0);
  assert.equal(engine.fireGrid[centerIdx], 255);

  // Test eye ignition
  engine.reset();
  assert.equal(engine.temp[centerIdx], 0);

  engine.igniteEyes();
  // Left eye ~ (0.555 * 180, 0.344 * 241) = (~100, ~83)
  const leftIdx = Math.round(0.344 * engine.gridH) * engine.gridW + Math.round(0.555 * engine.gridW);
  assert.ok(engine.temp[leftIdx] >= 2.0);

  // Spawns embers and smoke
  assert.ok(engine.embers.length > 0);
  assert.ok(engine.smokePuffs.length > 0);
});

test("ThermodynamicFireEngine runs combustion and diffusion step", () => {
  const engine = new ThermodynamicFireEngine();
  engine.igniteCircle(90, 120, 6, 2.0);

  const initialBurn = engine.burn[120 * engine.gridW + 90];
  assert.equal(initialBurn, 0);

  engine.step({ burnSpeed: 1.0 });

  assert.ok(engine.activeBurningCount > 0);
  // Fuel was consumed
  const postBurn = engine.burn[120 * engine.gridW + 90];
  assert.ok(postBurn > 0);

  // Spawns licking flame tongues
  assert.ok(engine.flameTongues.length > 0);
});

test("Particle classes update life and movement", () => {
  const smoke = new VolumetricSmokePuff(100, 100);
  const flame = new FlameTongue(100, 100);
  const ember = new EmberParticle(100, 100);

  const initialSmokeLife = smoke.life;
  smoke.update();
  assert.ok(smoke.life < initialSmokeLife);
  assert.ok(smoke.y < 100); // moves upward

  const initialFlameLife = flame.life;
  flame.update();
  assert.ok(flame.life < initialFlameLife);
  assert.ok(flame.y < 100); // licks upward

  const initialEmberLife = ember.life;
  ember.update();
  assert.ok(ember.life < initialEmberLife);
  assert.ok(ember.y < 100); // pops upward
});

test("applyPaperBurn modifies pixel alpha and charring", () => {
  const engine = new ThermodynamicFireEngine({
    nativeW: 10,
    nativeH: 10,
    gridW: 10,
    gridH: 10,
  });

  // Burn center cell completely (> 0.45)
  engine.burn[5 * 10 + 5] = 0.8;
  // Light char neighbor (0.2)
  engine.burn[5 * 10 + 4] = 0.2;

  const mockData = new Uint8ClampedArray(10 * 10 * 4);
  // Fill all with opaque white
  for (let i = 0; i < mockData.length; i += 4) {
    mockData[i] = 255;
    mockData[i + 1] = 255;
    mockData[i + 2] = 255;
    mockData[i + 3] = 255;
  }

  const mockCtx = {
    getImageData: () => ({ data: mockData }),
    putImageData: (imgData) => {
      // verified
    },
  };

  engine.applyPaperBurn(mockCtx, 10, 10);

  // Center pixel (5,5) should have alpha = 0 (punched hole)
  const centerIdx = (5 * 10 + 5) * 4;
  assert.equal(mockData[centerIdx + 3], 0);

  // Charred pixel (5,4) should have darkened RGB and alpha = 255
  const charIdx = (5 * 10 + 4) * 4;
  assert.ok(mockData[charIdx] < 255);
  assert.equal(mockData[charIdx + 3], 255);
});

test("applyPaperBurn gracefully handles tainted or throwing canvas contexts", () => {
  const engine = new ThermodynamicFireEngine({
    nativeW: 10,
    nativeH: 10,
    gridW: 10,
    gridH: 10,
  });

  engine.burn[5 * 10 + 5] = 0.8;

  const throwingCtx = {
    getImageData: () => {
      throw new Error("SecurityError: The canvas has been tainted by cross-origin data.");
    },
    putImageData: () => {},
  };

  assert.doesNotThrow(() => {
    engine.applyPaperBurn(throwingCtx, 10, 10);
  });
});

test("reset clears all combustion and burned fraction for fresh image loads", () => {
  const engine = new ThermodynamicFireEngine();
  engine.igniteCircle(20, 20, 5, 2.0);
  engine.step();
  engine.step();
  assert.ok(engine.activeBurningCount > 0);
  assert.ok(engine.totalBurned > 0);

  engine.reset();
  assert.equal(engine.activeBurningCount, 0);
  assert.equal(engine.totalBurned, 0);
  assert.equal(engine.burnedFraction, 0);
  assert.equal(engine.smokePuffs.length, 0);
  assert.equal(engine.embers.length, 0);
});

test("ThermodynamicFireEngine burns organically and completes burn within 30 seconds", () => {
  const engine = new ThermodynamicFireEngine({
    nativeW: 180,
    nativeH: 241,
    gridW: 60,
    gridH: 80,
    maxBurnDurationMs: 30000,
  });
  engine.igniteCircle(30, 40, 5, 2.0);
  engine.step({ burnSpeed: 1.0 });
  assert.ok(engine.activeBurningCount > 0, "Combustion should be active");

  let frames = 1;
  while (frames < 1800 && engine.burnedFraction < 0.95) {
    engine.step({ burnSpeed: 1.0 });
    frames++;
  }
  // At 60 fps, 1800 frames = 30 seconds
  assert.ok(frames <= 1800, `Should complete within 30 seconds (took ${frames} frames)`);
  assert.ok(engine.burnedFraction >= 0.95, "Should achieve >= 95% burned fraction within 30s");
});

test("ThermodynamicFireEngine burns normally in initial 5s and increments inward from perimeter", () => {
  const engine = new ThermodynamicFireEngine({
    nativeW: 180,
    nativeH: 240,
    gridW: 60,
    gridH: 80,
    maxBurnDurationMs: 30000,
  });

  // Ignite along perimeter (outside to inside)
  engine.ignitePerimeter(1.6);
  assert.ok(engine.activeBurningCount > 0, "Perimeter borders should be ignited");

  // Border cells should have heat
  assert.ok(engine.temp[0] > 1.0, "Top-left perimeter cell should be ignited");
  assert.ok(engine.temp[59] > 1.0, "Top-right perimeter cell should be ignited");
  assert.ok(engine.temp[(80 - 1) * 60] > 1.0, "Bottom-left perimeter cell should be ignited");

  // Center should be unburned initially
  const centerIdx = 40 * 60 + 30;
  assert.equal(engine.burn[centerIdx], 0, "Center must be unburned at start");

  // Simulate 300 frames (~5 seconds at 60fps)
  for (let f = 0; f < 300; f++) {
    engine.step({ burnSpeed: 1.0 });
  }

  // Initial 5 seconds should burn calmly (< 35% of total image)
  assert.ok(engine.burnedFraction < 0.35, "Initial 5 seconds must remain calm and steady");

  // Simulate remaining frames with incrementing acceleration
  let frames = 300;
  while (frames < 1800 && engine.burnedFraction < 0.95) {
    engine.step({ burnSpeed: 1.0 });
    frames++;
  }
  assert.ok(frames <= 1800, "Should achieve full consumption within 30 seconds");
  assert.ok(engine.burnedFraction >= 0.95, "Should achieve >= 95% burned fraction");
});

test("ThermodynamicFireEngine renders completed ash footprint", () => {
  const engine = new ThermodynamicFireEngine({
    nativeW: 180,
    nativeH: 240,
    gridW: 60,
    gridH: 80,
  });
  let rectCalls = 0;
  let ellipseCalls = 0;
  const mockCtx = {
    save() {},
    restore() {},
    fillRect() { rectCalls++; },
    strokeRect() { rectCalls++; },
    beginPath() {},
    ellipse() { ellipseCalls++; },
    fill() {},
  };
  engine.renderCompletedAsh(mockCtx, 180, 240);
  assert.ok(rectCalls >= 2, "Should draw burnt shadow and char edge");
  assert.ok(ellipseCalls > 0, "Should draw ash dust flakes");
});

test("ThermodynamicFireEngine triggers climactic flash when burned fraction reaches 92%", () => {
  const engine = new ThermodynamicFireEngine({
    nativeW: 180,
    nativeH: 240,
    gridW: 60,
    gridH: 80,
    maxBurnDurationMs: 30000,
  });

  // Burn 91% of cells
  const total = engine.totalCells;
  const count91 = Math.floor(total * 0.91);
  for (let i = 0; i < count91; i++) {
    engine.burn[i] = 1.0;
  }
  engine.totalBurned = count91;
  engine.burnedFraction = 0.91;
  engine.step({ burnSpeed: 1.0, now: 1000 });
  assert.equal(engine.climacticFlashTriggered, false);

  // Now burn to >= 92%
  const count92 = Math.floor(total * 0.925);
  for (let i = 0; i < count92; i++) {
    engine.burn[i] = 1.0;
  }
  engine.totalBurned = count92;
  engine.burnedFraction = 0.925;
  engine.step({ burnSpeed: 1.0, now: 1100 });
  assert.equal(engine.climacticFlashTriggered, true);
  assert.equal(engine.climacticFlashStartTime, 1100);
});

