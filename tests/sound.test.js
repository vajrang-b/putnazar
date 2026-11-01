import test from "node:test";
import assert from "node:assert/strict";
import { SoundEngine } from "../js/sound-engine.js";

function createMockAudioContext({ state = "suspended" } = {}) {
  let currentState = state;
  const calls = [];

  const mockGain = {
    gain: {
      value: 1,
      setValueAtTime(val) { this.value = val; calls.push({ op: "setValueAtTime", val }); },
      cancelScheduledValues() { calls.push({ op: "cancelScheduledValues" }); },
      exponentialRampToValueAtTime(val) { this.value = val; calls.push({ op: "exponentialRampToValueAtTime", val }); },
    },
    connect() {},
    disconnect() {},
  };

  const mockBuffer = {
    getChannelData() { return new Float32Array(100); },
  };

  const mockContext = {
    get state() { return currentState; },
    sampleRate: 44100,
    currentTime: 10,
    destination: {},
    calls,
    createGain() { return { ...mockGain }; },
    createBuffer() { return mockBuffer; },
    createBufferSource() {
      return {
        buffer: null,
        loop: false,
        connect() {},
        disconnect() {},
        start() { calls.push({ op: "startBufferSource" }); },
        stop() { calls.push({ op: "stopBufferSource" }); },
      };
    },
    createBiquadFilter() {
      return {
        type: "lowpass",
        frequency: { setValueAtTime(v) { this.value = v; } },
        Q: { setValueAtTime(v) { this.value = v; } },
        connect() {},
        disconnect() {},
      };
    },
    async resume() {
      currentState = "running";
      calls.push({ op: "resume" });
    },
    async close() {
      currentState = "closed";
      calls.push({ op: "close" });
    },
  };

  return mockContext;
}

test("SoundEngine initializes with specified defaults", () => {
  const engine = new SoundEngine({ volume: 0.8, muted: false });
  assert.equal(engine.volume, 0.8);
  assert.equal(engine.muted, false);
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.isUnlocked, false);
});

test("SoundEngine unlocks suspended AudioContext and notifies listeners", async () => {
  const mockCtx = createMockAudioContext({ state: "suspended" });
  let stateNotification = null;

  const engine = new SoundEngine({
    audioContext: mockCtx,
    onStateChange: (state) => { stateNotification = state; },
  });

  assert.equal(mockCtx.state, "suspended");
  engine.unlock();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(mockCtx.state, "running");
  assert.equal(engine.isUnlocked, true);
  assert.ok(stateNotification);
  assert.equal(stateNotification.isUnlocked, true);
});

test("SoundEngine play and stop transitions isPlaying state and procedural nodes", () => {
  const mockCtx = createMockAudioContext({ state: "running" });
  const engine = new SoundEngine({ audioContext: mockCtx });

  assert.equal(engine.isPlaying, false);
  engine.play();
  assert.equal(engine.isPlaying, true);
  assert.ok(engine.rumbleSource !== null);
  assert.ok(engine.hissSource !== null);

  engine.stop({ fade: false });
  assert.equal(engine.isPlaying, false);
  assert.equal(engine.rumbleSource, null);
  assert.equal(engine.hissSource, null);
});

test("SoundEngine setMuted and toggleMute control mute state and gain values", () => {
  const mockCtx = createMockAudioContext({ state: "running" });
  const engine = new SoundEngine({ audioContext: mockCtx, volume: 0.85 });

  assert.equal(engine.muted, false);
  assert.equal(engine.masterGain.gain.value, 0.85);

  engine.setMuted(true);
  assert.equal(engine.muted, true);
  assert.equal(engine.masterGain.gain.value, 0);

  engine.toggleMute();
  assert.equal(engine.muted, false);
  assert.equal(engine.masterGain.gain.value, 0.85);
});

test("SoundEngine destroy closes audioContext and clears nodes", () => {
  const mockCtx = createMockAudioContext({ state: "running" });
  const engine = new SoundEngine({ audioContext: mockCtx });
  engine.play();

  engine.destroy();
  assert.equal(engine.audioContext, null);
  assert.equal(engine.isPlaying, false);
  assert.equal(mockCtx.state, "closed");
});

test("SoundEngine triggerClimacticFlash synthesizes procedural whoosh surge without throwing", () => {
  const mockCtx = createMockAudioContext({ state: "running" });
  const engine = new SoundEngine({ audioContext: mockCtx, volume: 0.85 });

  assert.doesNotThrow(() => {
    engine.triggerClimacticFlash();
  });

  // Verify buffer source or oscillator nodes were started
  assert.ok(mockCtx.calls.some((c) => c.op === "startBufferSource"));
});
