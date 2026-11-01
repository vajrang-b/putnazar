/**
 * Physics-aligned sound engine for paper combustion.
 * Combines authentic stock audio playback with a procedural Web Audio combustion synthesizer
 * (cellulose snapping, convective air draft rumble, and ember sizzle) for zero-latency,
 * fail-safe audio across all browsers and autoplay security policies.
 */
export class SoundEngine {
  constructor(options = {}) {
    this.audioElement = options.audioElement || null;
    this.stockUrl = options.stockUrl || "./assets/Amazing Paper burning sound.mp3";
    this.fallbackUrl = options.fallbackUrl || "./assets/paper-burn.ogg";
    this.secondaryUrl = options.secondaryUrl || "./assets/paper-burn.mp3";
    this.volume = options.volume ?? 0.85;
    this.muted = Boolean(options.muted);
    this.isPlaying = false;
    this.isUnlocked = false;
    this.onStateChange = options.onStateChange || null;

    this.audioContext = options.audioContext || null;
    this.masterGain = null;
    this.stockBuffer = null;
    this.stockSourceNode = null;
    this.rumbleSource = null;
    this.hissSource = null;
    this._crackleInterval = null;
    this._fadeTimer = null;
    this._noiseBuffer = null;

    if (this.audioContext) {
      this._setupContext();
    }
  }

  _getContextClass() {
    if (typeof window !== "undefined") {
      return window.AudioContext || window.webkitAudioContext || null;
    }
    return null;
  }

  initContext() {
    if (this.audioContext) return this.audioContext;
    const AudioCtx = this._getContextClass();
    if (!AudioCtx) return null;
    try {
      this.audioContext = new AudioCtx();
      this._setupContext();
    } catch {
      this.audioContext = null;
    }
    return this.audioContext;
  }

  _setupContext() {
    if (!this.audioContext) return;
    try {
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(
        this.muted ? 0 : this.volume,
        this.audioContext.currentTime || 0
      );
      if (this.audioContext.destination) {
        this.masterGain.connect(this.audioContext.destination);
      }
      this._loadStockAudio();
    } catch {
      // Audio graph setup fallback
    }
  }

  _loadStockAudio() {
    if (typeof fetch === "undefined" || !this.audioContext || typeof this.audioContext.decodeAudioData !== "function") {
      return;
    }
    const tryUrl = async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const contentLength = res.headers?.get?.("content-length");
        // For large media (> 15 MB) like Amazing Paper burning sound (88MB),
        // let the streaming HTMLAudioElement handle playback without exhausting Web Audio memory
        if (contentLength && parseInt(contentLength, 10) > 15 * 1024 * 1024) {
          return;
        }
        const ab = await res.arrayBuffer();
        this.stockBuffer = await this.audioContext.decodeAudioData(ab);
        if (this.isPlaying && !this.stockSourceNode && !this.muted) {
          this._startStockSource();
        }
      } catch {
        if (url === this.stockUrl && this.fallbackUrl) {
          tryUrl(this.fallbackUrl);
        } else if (url === this.fallbackUrl && this.secondaryUrl) {
          tryUrl(this.secondaryUrl);
        }
      }
    };
    tryUrl(this.stockUrl);
  }

  unlock() {
    const ctx = this.initContext();
    if (ctx) {
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().then(() => {
          this.isUnlocked = true;
          this._notify();
          if (this.isPlaying) this._ensurePlaying();
        }).catch(() => {});
      } else if (ctx.state === "running") {
        this.isUnlocked = true;
        this._notify();
      }
    }

    if (this.audioElement) {
      const el = this.audioElement;
      if (el.paused && !this.isPlaying) {
        el.volume = 0.0001;
        const playPromise = el.play?.();
        if (playPromise && typeof playPromise.then === "function") {
          playPromise.then(() => {
            if (!this.isPlaying) {
              el.pause?.();
              try { el.currentTime = 0; } catch {}
            }
            el.volume = this.muted ? 0 : this.volume;
            this.isUnlocked = true;
            this._notify();
          }).catch(() => {});
        }
      }
    }
  }

  _getNoiseBuffer() {
    if (this._noiseBuffer) return this._noiseBuffer;
    if (!this.audioContext || typeof this.audioContext.createBuffer !== "function") return null;
    const duration = 2.0;
    const rate = this.audioContext.sampleRate || 44100;
    const length = Math.floor(rate * duration);
    const buffer = this.audioContext.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    this._noiseBuffer = buffer;
    return buffer;
  }

  _startStockSource() {
    if (!this.audioContext || !this.stockBuffer || this.stockSourceNode || !this.masterGain) return;
    try {
      const src = this.audioContext.createBufferSource();
      src.buffer = this.stockBuffer;
      src.loop = true;
      const gain = this.audioContext.createGain();
      gain.gain.setValueAtTime(0.85, this.audioContext.currentTime);
      src.connect(gain);
      gain.connect(this.masterGain);
      src.start(0);
      this.stockSourceNode = src;
    } catch {
      this.stockSourceNode = null;
    }
  }

  _startProceduralFire() {
    if (!this.audioContext || !this.masterGain) return;
    const noiseBuffer = this._getNoiseBuffer();
    if (!noiseBuffer) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime || 0;

    // 1. Low convective air rumble (buoyant thermal turbulence)
    if (!this.rumbleSource && typeof ctx.createBiquadFilter === "function") {
      try {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(130, now);
        filter.Q.setValueAtTime(1.4, now);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.55, now);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(0);
        this.rumbleSource = src;
      } catch {}
    }

    // 2. Combustion gas release & draft hiss (bandpass 800Hz)
    if (!this.hissSource && typeof ctx.createBiquadFilter === "function") {
      try {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(800, now);
        filter.Q.setValueAtTime(1.4, now);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, now);
        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        src.start(0);
        this.hissSource = src;
      } catch {}
    }
  }

  triggerCrackle() {
    // Click and synthetic pop sounds permanently disabled
  }

  triggerClimacticFlash() {
    if (this.muted) return;
    const ctx = this.initContext();
    if (!ctx) return;
    const now = ctx.currentTime || 0;

    // 1. Sudden convective air rush / whoosh: filter sweep on noise buffer
    const noiseBuffer = this._getNoiseBuffer();
    if (noiseBuffer && typeof ctx.createBiquadFilter === "function") {
      try {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer;
        const filter = ctx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(180, now);
        if (typeof filter.frequency.exponentialRampToValueAtTime === "function") {
          filter.frequency.exponentialRampToValueAtTime(750, now + 0.22);
          filter.frequency.exponentialRampToValueAtTime(130, now + 0.85);
        } else {
          filter.frequency.setValueAtTime(450, now);
        }
        filter.Q.setValueAtTime(2.2, now);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        if (typeof gain.gain.linearRampToValueAtTime === "function") {
          gain.gain.linearRampToValueAtTime(this.volume * 0.95, now + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
        } else {
          gain.gain.setValueAtTime(this.volume * 0.95, now);
        }

        src.connect(filter);
        filter.connect(gain);
        if (this.masterGain) {
          gain.connect(this.masterGain);
        } else if (ctx.destination) {
          gain.connect(ctx.destination);
        }
        src.start(now);
        if (typeof src.stop === "function") {
          src.stop(now + 0.95);
        }
      } catch {}
    }

    // 2. Sub-bass combustion resonance drop settling into ash
    if (typeof ctx.createOscillator === "function") {
      try {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(110, now);
        if (typeof osc.frequency.exponentialRampToValueAtTime === "function") {
          osc.frequency.exponentialRampToValueAtTime(32, now + 0.85);
        } else {
          osc.frequency.setValueAtTime(60, now);
        }

        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.001, now);
        if (typeof oscGain.gain.linearRampToValueAtTime === "function") {
          oscGain.gain.linearRampToValueAtTime(this.volume * 0.45, now + 0.18);
          oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        } else {
          oscGain.gain.setValueAtTime(this.volume * 0.45, now);
        }

        osc.connect(oscGain);
        if (this.masterGain) {
          oscGain.connect(this.masterGain);
        } else if (ctx.destination) {
          oscGain.connect(ctx.destination);
        }
        osc.start(now);
        if (typeof osc.stop === "function") {
          osc.stop(now + 0.9);
        }
      } catch {}
    }
  }

  updateBurnIntensity(activeCount = 50) {
    this.burningIntensity = Math.min(1.0, activeCount / 500);
    if (this.muted || activeCount === 0) {
      if (this.audioElement) {
        this.audioElement.volume = 0;
      }
      if (this.audioContext && this.masterGain) {
        if (typeof this.masterGain.gain.setTargetAtTime === "function") {
          this.masterGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.08);
        }
      }
      return;
    }
    const vol = this.volume * Math.max(0.25, this.burningIntensity);
    if (this.audioElement && !this.muted) {
      this.audioElement.volume = vol;
    }
    if (this.audioContext && this.masterGain) {
      if (typeof this.masterGain.gain.setTargetAtTime === "function") {
        this.masterGain.gain.setTargetAtTime(vol, this.audioContext.currentTime, 0.08);
      } else {
        this.masterGain.gain.value = vol;
      }
    }
  }

  _ensurePlaying() {
    if (!this.isPlaying) return;
    if (this.stockBuffer && !this.stockSourceNode) {
      this._startStockSource();
    }
    this._startProceduralFire();

    if (this.audioElement && this.audioElement.paused && !this.muted) {
      this.audioElement.volume = this.volume;
      this.audioElement.play?.()?.catch?.(() => {});
    }
  }

  play() {
    this.isPlaying = true;
    if (this._fadeTimer) {
      clearTimeout(this._fadeTimer);
      this._fadeTimer = null;
    }

    const ctx = this.initContext();
    if (ctx) {
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        ctx.resume().catch(() => {});
      }
      if (this.masterGain) {
        const now = ctx.currentTime || 0;
        this.masterGain.gain.cancelScheduledValues?.(now);
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, now);
      }
      this._ensurePlaying();
    }

    if (this.audioElement && !this.muted) {
      this.audioElement.volume = this.volume;
      this.audioElement.play?.()?.catch?.(() => {});
    }

    this._notify();
  }

  pause() {
    this.isPlaying = false;
    this._stopAllNodes();
    if (this.audioElement) {
      this.audioElement.pause?.();
    }
    this._notify();
  }

  stop({ fade = false } = {}) {
    if (!this.isPlaying) return;
    if (fade && this.audioContext && this.masterGain && !this.muted) {
      const now = this.audioContext.currentTime || 0;
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
      } catch {}

      if (this.audioElement && !this.audioElement.paused) {
        let v = this.audioElement.volume;
        const elFade = setInterval(() => {
          v = Math.max(0, v - 0.15);
          if (this.audioElement) this.audioElement.volume = v;
          if (v <= 0.05) {
            clearInterval(elFade);
            this.audioElement?.pause?.();
            try { if (this.audioElement) this.audioElement.currentTime = 0; } catch {}
          }
        }, 60);
      }

      this._fadeTimer = setTimeout(() => {
        this.pause();
      }, 700);
    } else {
      this.pause();
      if (this.audioElement) {
        try { this.audioElement.currentTime = 0; } catch {}
      }
    }
  }

  _stopAllNodes() {
    if (this._crackleInterval) {
      clearInterval(this._crackleInterval);
      this._crackleInterval = null;
    }
    if (this.stockSourceNode) {
      try { this.stockSourceNode.stop?.(); this.stockSourceNode.disconnect?.(); } catch {}
      this.stockSourceNode = null;
    }
    if (this.rumbleSource) {
      try { this.rumbleSource.stop?.(); this.rumbleSource.disconnect?.(); } catch {}
      this.rumbleSource = null;
    }
    if (this.hissSource) {
      try { this.hissSource.stop?.(); this.hissSource.disconnect?.(); } catch {}
      this.hissSource = null;
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.masterGain && this.audioContext) {
      const now = this.audioContext.currentTime || 0;
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, now);
      } catch {}
    }
    if (this.audioElement) {
      this.audioElement.volume = this.muted ? 0 : this.volume;
      if (this.muted) {
        this.audioElement.pause?.();
      } else if (this.isPlaying) {
        this.audioElement.play?.()?.catch?.(() => {});
      }
    }
    if (!this.muted && this.isPlaying) {
      this.unlock();
      this._ensurePlaying();
    }
    this._notify();
    return this.muted;
  }

  toggleMute() {
    return this.setMuted(!this.muted);
  }

  _notify() {
    if (typeof this.onStateChange === "function") {
      this.onStateChange({
        isPlaying: this.isPlaying,
        isMuted: this.muted,
        isUnlocked: this.isUnlocked,
      });
    }
  }

  destroy() {
    this.stop({ fade: false });
    this._stopAllNodes();
    if (this.audioContext && typeof this.audioContext.close === "function") {
      this.audioContext.close().catch?.(() => {});
    }
    this.audioContext = null;
    this.masterGain = null;
    this._noiseBuffer = null;
    this.stockBuffer = null;
  }
}
