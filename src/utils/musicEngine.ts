import { MUSIC_TRACKS, getDefaultTrackForGenre, getRecommendedGenreForModule } from '../data/musicTracks';
import type { AppModuleId, MusicGenreId, MusicTrack } from '../types/lifeworld';
import { soundEngine } from './soundEngine';

export interface MusicPlayerSnapshot {
  isPlaying: boolean;
  currentTrack: MusicTrack;
  volume: number;
  autoSyncModule: boolean;
  currentStep: number;
}

type MusicListener = (snapshot: MusicPlayerSnapshot) => void;

function semitoneToHz(rootHz: number, semitones: number): number {
  return rootHz * Math.pow(2, semitones / 12);
}

class LifeWorldMusicEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private schedulerId: number | null = null;
  private nextStepTime = 0;
  private currentStep = 0;
  private isPlaying = false;
  private volume = 0.45;
  private autoSyncModule = false;
  private currentTrack: MusicTrack = MUSIC_TRACKS[0];
  private listeners = new Set<MusicListener>();
  private freqScratch = new Uint8Array(32);

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume * 0.55, this.ctx.currentTime);

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.78;

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);

      // Build reusable noise buffer for snares/hats
      const length = this.ctx.sampleRate * 0.6;
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((cb) => cb(snap));
  }

  subscribe(listener: MusicListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): MusicPlayerSnapshot {
    return {
      isPlaying: this.isPlaying,
      currentTrack: this.currentTrack,
      volume: this.volume,
      autoSyncModule: this.autoSyncModule,
      currentStep: this.currentStep,
    };
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0.05, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume * 0.55, this.ctx.currentTime, 0.04);
    }
    this.emit();
  }

  setAutoSyncModule(enabled: boolean): void {
    this.autoSyncModule = enabled;
    this.emit();
  }

  selectTrack(trackId: string, autoPlay = true): void {
    const found = MUSIC_TRACKS.find((t) => t.id === trackId);
    if (!found) return;
    this.currentTrack = found;
    this.currentStep = 0;
    if (autoPlay) {
      this.start();
    } else {
      this.emit();
    }
  }

  playGenre(genre: MusicGenreId): void {
    const track = getDefaultTrackForGenre(genre);
    this.currentTrack = track;
    this.currentStep = 0;
    this.start();
  }

  playForModule(moduleId: AppModuleId): void {
    const genre = getRecommendedGenreForModule(moduleId);
    this.playGenre(genre);
  }

  syncModuleIfEnabled(moduleId: AppModuleId): void {
    if (!this.autoSyncModule) return;
    const genre = getRecommendedGenreForModule(moduleId);
    if (this.currentTrack.genre !== genre) {
      const nextTrack = getDefaultTrackForGenre(genre);
      this.currentTrack = nextTrack;
      this.currentStep = 0;
      this.emit();
    }
  }

  nextTrack(): void {
    const idx = MUSIC_TRACKS.findIndex((t) => t.id === this.currentTrack.id);
    const next = MUSIC_TRACKS[(idx + 1) % MUSIC_TRACKS.length];
    this.currentTrack = next;
    this.currentStep = 0;
    this.emit();
  }

  prevTrack(): void {
    const idx = MUSIC_TRACKS.findIndex((t) => t.id === this.currentTrack.id);
    const prev = MUSIC_TRACKS[(idx - 1 + MUSIC_TRACKS.length) % MUSIC_TRACKS.length];
    this.currentTrack = prev;
    this.currentStep = 0;
    this.emit();
  }

  togglePlay(): void {
    if (this.isPlaying) {
      this.stop();
    } else {
      this.start();
    }
  }

  start(): void {
    soundEngine.stopSoundscape();
    const ctx = this.ensureContext();
    if (!ctx) {
      this.isPlaying = true;
      this.emit();
      return;
    }

    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
    }

    this.isPlaying = true;
    this.nextStepTime = ctx.currentTime + 0.04;

    this.schedulerId = window.setInterval(() => {
      this.scheduleAhead();
    }, 45);
    this.emit();
  }

  stop(): void {
    if (this.schedulerId !== null) {
      window.clearInterval(this.schedulerId);
      this.schedulerId = null;
    }
    this.isPlaying = false;
    this.emit();
  }

  getVisualizerBars(barCount = 16): number[] {
    if (!this.isPlaying) {
      return new Array(barCount).fill(0.12);
    }
    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freqScratch);
      const out: number[] = [];
      const stride = Math.max(1, Math.floor(this.freqScratch.length / barCount));
      let hasSignal = false;
      for (let i = 0; i < barCount; i++) {
        const val = this.freqScratch[Math.min(this.freqScratch.length - 1, i * stride)] / 255;
        if (val > 0.02) hasSignal = true;
        out.push(Math.max(0.14, Math.min(1, val * 1.15)));
      }
      if (hasSignal) return out;
    }
    // Fallback expressive rhythm envelope when headless audio context suspends
    const out: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const wave = Math.abs(Math.sin((this.currentStep + i * 0.7) * 0.55));
      out.push(0.2 + wave * 0.72);
    }
    return out;
  }

  private scheduleAhead(): void {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;
    const stepDuration = 60 / this.currentTrack.bpm / 2; // eighth-note grid
    while (this.nextStepTime < this.ctx.currentTime + 0.14) {
      this.scheduleStep(this.currentStep, this.nextStepTime, stepDuration);
      this.nextStepTime += stepDuration;
      this.currentStep = (this.currentStep + 1) % 32;
    }
  }

  private scheduleStep(step: number, time: number, stepDur: number): void {
    const track = this.currentTrack;
    const stepInBar = step % 8;
    const chordIdx = Math.floor(step / 8) % track.chordProgressions.length;
    const chord = track.chordProgressions[chordIdx];

    // 1. Drums
    this.triggerDrums(track.drumStyle, stepInBar, time);

    // 2. Bassline
    const bassSemitone = track.bassPattern[stepInBar];
    if (bassSemitone !== undefined && bassSemitone > -50) {
      this.triggerBass(
        semitoneToHz(track.rootHz * 0.5, bassSemitone),
        time,
        stepDur * 0.85,
        track.drumStyle === 'phonk'
      );
    }

    // 3. Harmonic Chords on bar downbeat & syncopated hits
    if (
      stepInBar === 0 ||
      (track.drumStyle === 'four_floor' && stepInBar === 3) ||
      ((track.drumStyle === 'boom_bap' || track.drumStyle === 'chillhop' || track.drumStyle === 'piano_soft') &&
        stepInBar === 4)
    ) {
      this.triggerChord(
        chord.map((s) => semitoneToHz(track.rootHz * 2, s)),
        time,
        track.drumStyle === 'zen_chime' || track.drumStyle === 'piano_soft'
          ? stepDur * 5.2
          : stepDur * 2.8,
        track.synthVoice
      );
    }

    // 4. Melody / Lead Hook
    const leadSemi = track.leadPattern[stepInBar];
    if (leadSemi !== undefined && leadSemi > -50) {
      const octaveVariation = step >= 16 && stepInBar % 2 === 0 ? 12 : 0;
      this.triggerLead(
        semitoneToHz(
          track.rootHz * 2,
          leadSemi + (track.synthVoice === 'bowl' || track.synthVoice === 'pad' ? 0 : octaveVariation)
        ),
        time,
        track.synthVoice === 'bowl' || track.synthVoice === 'pad'
          ? stepDur * 3.5
          : track.synthVoice === 'piano'
            ? stepDur * 1.4
            : stepDur * 0.72,
        track.synthVoice
      );
    }
  }

  private triggerDrums(style: MusicTrack['drumStyle'], stepInBar: number, time: number): void {
    if (style === 'zen_chime' || style === 'piano_soft') {
      return;
    }
    const isKick =
      style === 'four_floor'
        ? stepInBar % 2 === 0
        : style === 'phonk'
          ? stepInBar === 0 || stepInBar === 3 || stepInBar === 5
          : stepInBar === 0 || stepInBar === 3 || stepInBar === 6;

    const isSnare =
      style === 'four_floor'
        ? stepInBar === 2 || stepInBar === 6
        : stepInBar === 2 || stepInBar === 6;

    const isHat =
      style === 'phonk' || style === 'arcade'
        ? true
        : stepInBar % 2 === 1 || stepInBar === 0;

    if (isKick) this.playKick(time, style === 'phonk' ? 1.2 : style === 'chillhop' ? 0.75 : 0.9);
    if (isSnare) {
      this.playSnare(
        time,
        style === 'boom_bap' || style === 'vpop_chill' || style === 'chillhop' ? 0.13 : 0.22
      );
    }
    if (isHat) this.playHat(time, stepInBar % 2 === 1 ? 0.075 : 0.035);
  }

  private playKick(time: number, punch: number): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145 * punch, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.14);

    gain.gain.setValueAtTime(0.45 * punch, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.24);
  }

  private playSnare(time: number, level: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1850, time);
    filter.Q.setValueAtTime(1.1, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(time);
    src.stop(time + 0.17);
  }

  private playHat(time: number, level: number): void {
    if (!this.ctx || !this.masterGain || !this.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6800, time);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(level, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.055);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    src.start(time);
    src.stop(time + 0.065);
  }

  private triggerBass(freq: number, time: number, dur: number, heavy808: boolean): void {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = heavy808 ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(freq, time);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(heavy808 ? 320 : 240, time);

    gain.gain.setValueAtTime(heavy808 ? 0.34 : 0.24, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.03);
  }

  private triggerChord(freqs: number[], time: number, dur: number, voice: MusicTrack['synthVoice']): void {
    if (!this.ctx || !this.masterGain) return;
    freqs.forEach((f) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type =
        voice === 'supersaw' || voice === 'square'
          ? 'sawtooth'
          : voice === 'piano' || voice === 'pad'
            ? 'triangle'
            : 'sine';
      osc.frequency.setValueAtTime(f, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(
        voice === 'rhodes' || voice === 'bowl' || voice === 'pad' ? 1150 : voice === 'piano' ? 1750 : 2200,
        time
      );

      const peak = voice === 'bowl' || voice === 'pad' ? 0.065 : voice === 'piano' ? 0.05 : 0.055;
      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(peak, time + (voice === 'pad' ? 0.14 : 0.04));
      gain.gain.exponentialRampToValueAtTime(0.0008, time + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + dur + 0.05);
    });
  }

  private triggerLead(freq: number, time: number, dur: number, voice: MusicTrack['synthVoice']): void {
    if (!this.ctx || !this.masterGain) return;

    if (voice === 'cowbell') {
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const bandpass = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc1.type = 'square';
      osc2.type = 'square';
      osc1.frequency.setValueAtTime(freq, time);
      osc2.frequency.setValueAtTime(freq * 1.48, time);

      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(freq * 1.35, time);
      bandpass.Q.setValueAtTime(2.6, time);

      gain.gain.setValueAtTime(0.16, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + Math.min(0.28, dur));

      osc1.connect(bandpass);
      osc2.connect(bandpass);
      bandpass.connect(gain);
      gain.connect(this.masterGain);

      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + 0.3);
      osc2.stop(time + 0.3);
      return;
    }

    if (voice === 'piano') {
      // Rich acoustic piano approximation: fundamental + soft 2nd harmonic shimmer
      const osc = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      overtone.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);
      overtone.frequency.setValueAtTime(freq * 2, time);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2800, time);
      filter.frequency.exponentialRampToValueAtTime(750, time + Math.max(0.25, dur));

      gain.gain.setValueAtTime(0.001, time);
      gain.gain.linearRampToValueAtTime(0.125, time + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, time + Math.max(0.45, dur));

      osc.connect(filter);
      overtone.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      overtone.start(time);
      osc.stop(time + Math.max(0.48, dur + 0.04));
      overtone.stop(time + Math.max(0.48, dur + 0.04));
      return;
    }

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type =
      voice === 'square'
        ? 'square'
        : voice === 'supersaw'
          ? 'sawtooth'
          : voice === 'pluck'
            ? 'triangle'
            : 'sine';

    osc.frequency.setValueAtTime(freq, time);

    const peak = voice === 'square' ? 0.09 : voice === 'bowl' || voice === 'pad' ? 0.11 : 0.11;
    gain.gain.setValueAtTime(0.001, time);
    gain.gain.linearRampToValueAtTime(peak, time + (voice === 'pad' ? 0.09 : 0.015));
    gain.gain.exponentialRampToValueAtTime(0.001, time + dur);

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + dur + 0.04);
  }
}

export const musicEngine = new LifeWorldMusicEngine();
