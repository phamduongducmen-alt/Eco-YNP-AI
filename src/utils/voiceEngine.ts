import { getCountryVoiceProfile, getVoicePersonaSpec } from '../data/voices';
import type { VoiceGender } from '../types/lifeworld';

export interface SpeakAiVoiceOptions {
  text: string;
  languageCode?: string;
  bcp47?: string;
  gender?: VoiceGender;
  voiceNameOverride?: 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';
  rate?: number;
  styleContext?: 'fitness' | 'language' | 'assistant' | 'alarm';
  vietnameseRegion?: 'north' | 'south';
  onStart?: () => void;
  onEnd?: () => void;
}

export interface SimpleSpeechVoiceLike {
  name: string;
  lang: string;
}

let activeAudioElement: HTMLAudioElement | null = null;

export function stopActiveAiVoice(): void {
  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.src = '';
    } catch {
      // ignore cleanup error
    }
    activeAudioElement = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore speech cancel error
    }
  }
}

export function normalizeVietnameseForSpeech(text: string): string {
  if (!text) return '';
  let out = text
    // Strip decorative symbols & bullets
    .replace(/[•★☆✓✔→←↑↓✨🎵🔊🎧🎙️]/g, ', ')
    // Separators used in UI cards
    .replace(/\s*[·|]\s*/g, ', ')
    // Step numbering like "01." or "Bước 01:"
    .replace(/\bBước\s*0?(\d+)\s*[:.]/gi, 'Bước $1, ')
    .replace(/(^|\s)0?(\d+)\.\s+/g, '$1Bước $2, ')
    // Numeric ranges "10–14" or "10-14"
    .replace(/(\d+)\s*[–—-]\s*(\d+)/g, '$1 đến $2')
    // Common abbreviations & units
    .replace(/(\d+(?:[.,]\d+)?)\s*kcal\b/gi, '$1 ki-lô ca-lo')
    .replace(/(\d+(?:[.,]\d+)?)\s*ml\b/gi, '$1 mi-li-lít')
    .replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi, '$1 ki-lô-gam')
    .replace(/(\d+(?:[.,]\d+)?)\s*cm\b/gi, '$1 xen-ti-mét')
    .replace(/(\d+(?:[.,]\d+)?)\s*bpm\b/gi, '$1 nhịp mỗi phút')
    .replace(/(\d+(?:[.,]\d+)?)\s*p\b/gi, '$1 phút')
    .replace(/(\d+(?:[.,]\d+)?)\s*s\b/gi, '$1 giây')
    .replace(/(\d+(?:[.,]\d+)?)\s*g\b/gi, '$1 gam')
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 phần trăm')
    // Slash between Vietnamese words or numbers
    .replace(/\s*\/\s*/g, ', ')
    // Collapse excess punctuation/whitespace for clean breath pauses
    .replace(/\s*,\s*(?:,\s*)+/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (out && !/[.!?…]$/.test(out)) {
    out = `${out}.`;
  }
  return out;
}

export function buildCountrySpeechStyle(params: {
  languageCode: string;
  gender: VoiceGender;
  styleContext?: 'fitness' | 'language' | 'assistant' | 'alarm';
  vietnameseRegion?: 'north' | 'south';
}): string {
  const profile = getCountryVoiceProfile(params.languageCode);
  const spec = getVoicePersonaSpec(params.languageCode, params.gender);
  const regionNote =
    params.languageCode === 'vi'
      ? params.vietnameseRegion === 'south'
        ? ' Use a crystal-clear, warm Southern Vietnamese (Saigon) accent with accurate six-tone contours, distinct syllable separation, and gentle natural breath pauses.'
        : ' Use a crystal-clear, warm standard Northern Vietnamese (Hanoi) accent with accurate six-tone contours, crisp syllable articulation, and natural storytelling pauses.'
      : '';
  const contextNote =
    params.styleContext === 'fitness'
      ? ' Speak as an encouraging personal fitness trainer pacing exercises clearly.'
      : params.styleContext === 'language'
        ? ' Speak clearly for language learners with natural native intonation.'
        : params.styleContext === 'alarm'
          ? ' Speak brightly as a calm smart health reminder.'
          : '';
  return `${spec.stylePrompt} speaking ${profile.languageVi} (${profile.bcp47}).${regionNote}${contextNote}`;
}

export function pickBestBrowserVoice<T extends SimpleSpeechVoiceLike>(
  voices: T[],
  bcp47: string,
  gender: VoiceGender,
  languageCode = 'vi'
): { voice: T | null; matchedGenderExplicitly: boolean } {
  if (!voices || voices.length === 0) {
    return { voice: null, matchedGenderExplicitly: false };
  }

  const normalizedTag = bcp47.toLowerCase();
  const langPrefix = normalizedTag.split('-')[0];
  const localeCandidates = voices.filter(
    (v) =>
      v.lang.toLowerCase() === normalizedTag ||
      v.lang.toLowerCase().startsWith(`${langPrefix}-`) ||
      v.lang.toLowerCase() === langPrefix
  );
  const pool = localeCandidates.length > 0 ? localeCandidates : voices;

  const spec = getVoicePersonaSpec(languageCode, gender);
  const oppositeSpec = getVoicePersonaSpec(languageCode, gender === 'male' ? 'female' : 'male');

  const matchesHint = (voiceName: string, hints: string[]) => {
    const normalized = voiceName.toLowerCase().replace(/[-_]/g, ' ');
    return hints.some((hint) => {
      const h = hint.toLowerCase();
      if (h.includes(' ') || h.length >= 6) {
        return normalized.includes(h);
      }
      const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|\\b|[^a-z])${escaped}($|\\b|[^a-z])`).test(normalized);
    });
  };

  const qualityScore = (voiceName: string): number => {
    const lower = voiceName.toLowerCase();
    let score = 0;
    if (lower.includes('natural')) score += 4;
    if (lower.includes('online')) score += 3;
    if (lower.includes('google')) score += 2;
    if (lower.includes('neural')) score += 2;
    return score;
  };

  const genderMatches = pool
    .filter((v) => matchesHint(v.name, spec.webSpeechHints))
    .sort((a, b) => qualityScore(b.name) - qualityScore(a.name));

  if (genderMatches.length > 0) {
    return { voice: genderMatches[0], matchedGenderExplicitly: true };
  }

  // Try choosing a high-quality voice that doesn't strongly match the opposite gender
  const rankedPool = [...pool].sort((a, b) => qualityScore(b.name) - qualityScore(a.name));
  if (rankedPool.length > 1) {
    const nonOpposite = rankedPool.find((v) => !matchesHint(v.name, oppositeSpec.webSpeechHints));
    if (nonOpposite) {
      return { voice: nonOpposite, matchedGenderExplicitly: false };
    }
  }

  return { voice: rankedPool[0] || null, matchedGenderExplicitly: false };
}

export function isRiffWavBase64(base64: string): boolean {
  if (!base64 || base64.length < 16) return false;
  // "RIFF" in base64 starts with "UklGR"
  return base64.startsWith('UklGR');
}

export function pcm16ToWavBase64(pcmBase64: string, sampleRate = 24000): string {
  const binary =
    typeof atob === 'function'
      ? atob(pcmBase64)
      : Buffer.from(pcmBase64, 'base64').toString('binary');
  const dataSize = binary.length;
  const headerSize = 44;
  const totalBytes = new Uint8Array(headerSize + dataSize);
  const view = new DataView(totalBytes.buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      totalBytes[offset + i] = str.charCodeAt(i);
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < dataSize; i++) {
    totalBytes[headerSize + i] = binary.charCodeAt(i);
  }

  if (typeof btoa === 'function') {
    let out = '';
    for (let i = 0; i < totalBytes.length; i++) {
      out += String.fromCharCode(totalBytes[i]);
    }
    return btoa(out);
  }
  return Buffer.from(totalBytes).toString('base64');
}

export async function speakWithAiVoice(options: SpeakAiVoiceOptions): Promise<{
  provider: 'gemini' | 'browser' | 'none';
  gender: VoiceGender;
}> {
  const {
    text,
    languageCode = 'vi',
    bcp47 = getCountryVoiceProfile(languageCode).bcp47,
    gender = 'female',
    voiceNameOverride,
    rate = 0.96,
    styleContext = 'language',
    vietnameseRegion = 'north',
    onStart,
    onEnd,
  } = options;

  const rawClean = text.trim();
  const clean = languageCode === 'vi' ? normalizeVietnameseForSpeech(rawClean) : rawClean;
  if (!clean) {
    onEnd?.();
    return { provider: 'none', gender };
  }

  stopActiveAiVoice();
  onStart?.();

  const persona = getVoicePersonaSpec(languageCode, gender);
  const geminiVoice = voiceNameOverride && gender === 'female' ? voiceNameOverride : persona.geminiVoice;
  const effectiveRate = languageCode === 'vi' && rate === 0.96 ? 0.91 : rate;

  try {
    const resp = await fetch('/api/speech/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: clean.slice(0, 600),
        voiceGender: gender,
        voiceName: geminiVoice,
        languageCode,
        bcp47,
        styleContext,
        vietnameseRegion,
      }),
    });

    if (resp.ok) {
      const json = (await resp.json()) as { audioBase64?: string; mimeType?: string };
      if (json.audioBase64) {
        const wavBase64 = isRiffWavBase64(json.audioBase64)
          ? json.audioBase64
          : pcm16ToWavBase64(json.audioBase64, 24000);
        const audio = new Audio(`data:audio/wav;base64,${wavBase64}`);
        audio.playbackRate = Math.max(0.65, Math.min(1.4, effectiveRate));
        activeAudioElement = audio;
        await new Promise<void>((resolve) => {
          audio.onended = () => {
            if (activeAudioElement === audio) activeAudioElement = null;
            resolve();
          };
          audio.onerror = () => {
            if (activeAudioElement === audio) activeAudioElement = null;
            resolve();
          };
          void audio.play().catch(() => resolve());
        });
        onEnd?.();
        return { provider: 'gemini', gender };
      }
    }
  } catch {
    // Graceful fallback to browser speech synthesis below
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const available = window.speechSynthesis.getVoices();
      const { voice, matchedGenderExplicitly } = pickBestBrowserVoice(
        available,
        bcp47,
        gender,
        languageCode
      );

      const utter = new SpeechSynthesisUtterance(clean.slice(0, 500));
      utter.lang = bcp47;
      if (voice) {
        utter.voice = voice;
      }
      // Calibrate pitch distinctly for Male vs Female when browser lacks a native gendered voice
      utter.pitch = matchedGenderExplicitly ? persona.pitch : gender === 'male' ? 0.82 : 1.08;
      utter.rate = Math.max(
        0.65,
        Math.min(1.35, effectiveRate * (gender === 'male' ? 0.96 : 1.0))
      );

      await new Promise<void>((resolve) => {
        const safetyTimeout = window.setTimeout(() => resolve(), 9000);
        utter.onend = () => {
          window.clearTimeout(safetyTimeout);
          resolve();
        };
        utter.onerror = () => {
          window.clearTimeout(safetyTimeout);
          resolve();
        };
        window.speechSynthesis.speak(utter);
      });

      onEnd?.();
      return { provider: 'browser', gender };
    } catch {
      onEnd?.();
      return { provider: 'none', gender };
    }
  }

  onEnd?.();
  return { provider: 'none', gender };
}
