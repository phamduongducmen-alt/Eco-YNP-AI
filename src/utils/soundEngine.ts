export type SoundscapeId = 'rain' | 'forest' | 'ocean' | 'alpha_focus' | 'deep_sleep' | 'yoga_bowl';

class LifeWorldSoundEngine {
  private ctx: AudioContext | null = null;
  private activeSource: AudioNode | null = null;
  private activeGain: GainNode | null = null;
  private activeOscillators: OscillatorNode[] = [];
  private activeId: SoundscapeId | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playTone(freq: number, durationMs = 160, type: OscillatorType = 'sine', volume = 0.08): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
  }

  playAlarmChime(): void {
    this.playTone(523.25, 180, 'triangle', 0.1);
    setTimeout(() => this.playTone(659.25, 180, 'triangle', 0.1), 160);
    setTimeout(() => this.playTone(783.99, 280, 'triangle', 0.11), 320);
  }

  playGameFeedback(kind: 'match' | 'win' | 'error' | 'collect'): void {
    if (kind === 'match' || kind === 'collect') {
      this.playTone(587.33, 110, 'sine', 0.07);
      setTimeout(() => this.playTone(880, 140, 'sine', 0.08), 80);
    } else if (kind === 'win') {
      this.playAlarmChime();
    } else {
      this.playTone(220, 170, 'sawtooth', 0.05);
    }
  }

  stopSoundscape(): void {
    if (this.activeSource && 'stop' in this.activeSource && typeof (this.activeSource as AudioScheduledSourceNode).stop === 'function') {
      try {
        (this.activeSource as AudioScheduledSourceNode).stop();
      } catch {
        // already stopped
      }
    }
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
      } catch {
        // already stopped
      }
    }
    this.activeOscillators = [];
    if (this.activeGain) {
      try {
        this.activeGain.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeSource = null;
    this.activeGain = null;
    this.activeId = null;
  }

  startSoundscape(id: SoundscapeId, volume = 0.25): void {
    this.stopSoundscape();
    const ctx = this.getContext();
    if (!ctx) return;

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(Math.max(0.02, Math.min(0.6, volume)), ctx.currentTime);
    masterGain.connect(ctx.destination);
    this.activeGain = masterGain;
    this.activeId = id;

    if (id === 'rain' || id === 'forest' || id === 'ocean') {
      // Filtered brown/pink procedural noise buffer
      const bufferSize = ctx.sampleRate * 3;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.03 * white) / 1.03;
        lastOut = output[i];
        output[i] *= 2.8;
      }
      const source = ctx.createBufferSource();
      source.buffer = noiseBuffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        id === 'rain' ? 1150 : id === 'forest' ? 680 : 420,
        ctx.currentTime
      );
      source.connect(filter);
      filter.connect(masterGain);
      source.start();
      this.activeSource = source;
      return;
    }

    // Harmonic / binaural tones for Alpha Focus, Deep Sleep, Yoga Singing Bowl
    const baseFreq = id === 'alpha_focus' ? 200 : id === 'deep_sleep' ? 136.1 : 174;
    const beatOffset = id === 'alpha_focus' ? 10 : id === 'deep_sleep' ? 3 : 6;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = 'sine';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc2.frequency.setValueAtTime(baseFreq + beatOffset, ctx.currentTime);

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0.18, ctx.currentTime);
    osc1.connect(toneGain);
    osc2.connect(toneGain);
    toneGain.connect(masterGain);

    osc1.start();
    osc2.start();
    this.activeOscillators = [osc1, osc2];
  }

  setVolume(volume: number): void {
    if (this.activeGain && this.ctx) {
      this.activeGain.gain.setTargetAtTime(
        Math.max(0.01, Math.min(0.6, volume)),
        this.ctx.currentTime,
        0.05
      );
    }
  }

  getActiveSoundscape(): SoundscapeId | null {
    return this.activeId;
  }
}

export const soundEngine = new LifeWorldSoundEngine();
