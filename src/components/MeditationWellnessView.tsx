import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Circle,
  Lock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import type {
  DailyHabitItem,
  EncryptedMoodJournalEntry,
  UiLanguage,
} from '../types/lifeworld';
import { encryptPayloadAes256 } from '../utils/cryptoVault';
import { musicEngine } from '../utils/musicEngine';
import { soundEngine, type SoundscapeId } from '../utils/soundEngine';

interface MeditationWellnessViewProps {
  uiLang: UiLanguage;
  meditationMinutesToday: number;
  habits: DailyHabitItem[];
  moodJournals: EncryptedMoodJournalEntry[];
  onLogMeditationMinutes: (minutes: number) => void;
  onToggleHabit: (id: string) => void;
  onAddHabit: (title: string) => void;
  onDeleteHabit: (id: string) => void;
  onAddMoodJournal: (entry: EncryptedMoodJournalEntry) => void;
}

const SOUNDSCAPES: Array<{ id: SoundscapeId; nameVi: string; nameEn: string; detail: string }> = [
  { id: 'rain', nameVi: 'Mưa đêm dịu nhẹ', nameEn: 'Soft Night Rain', detail: 'Pink noise lọc tần số 1150Hz' },
  { id: 'forest', nameVi: 'Rừng thông gió sớm', nameEn: 'Morning Pine Forest', detail: 'Âm nền tự nhiên 680Hz' },
  { id: 'ocean', nameVi: 'Sóng biển sâu', nameEn: 'Deep Ocean Waves', detail: 'Tần số trầm 420Hz thư giãn' },
  { id: 'alpha_focus', nameVi: 'Sóng Alpha Tập trung', nameEn: 'Alpha Focus 10Hz', detail: 'Binaural 200Hz / 210Hz' },
  { id: 'deep_sleep', nameVi: 'Delta Ngủ sâu', nameEn: 'Deep Sleep 3Hz', detail: 'Binaural 136.1Hz / 139.1Hz' },
  { id: 'yoga_bowl', nameVi: 'Chuông xoay Yoga', nameEn: 'Yoga Singing Bowl', detail: 'Harmonic 174Hz / 180Hz' },
];

const MOOD_LEVELS: Array<{ score: 1 | 2 | 3 | 4 | 5; labelVi: string; labelEn: string }> = [
  { score: 1, labelVi: 'Kiệt sức / Quá tải', labelEn: 'Exhausted' },
  { score: 2, labelVi: 'Hơi căng thẳng', labelEn: 'Stressed' },
  { score: 3, labelVi: 'Bình ổn', labelEn: 'Balanced' },
  { score: 4, labelVi: 'Thư thái', labelEn: 'Calm' },
  { score: 5, labelVi: 'Rạng rỡ & An yên', labelEn: 'Radiant' },
];

const MOOD_TAGS = ['Bình tĩnh', 'Biết ơn', 'Tập trung', 'Căng thẳng', 'Mệt mỏi', 'Hy vọng'];

export const MeditationWellnessView: React.FC<MeditationWellnessViewProps> = ({
  uiLang,
  meditationMinutesToday,
  habits,
  moodJournals,
  onLogMeditationMinutes,
  onToggleHabit,
  onAddHabit,
  onDeleteHabit,
  onAddMoodJournal,
}) => {
  // Meditation Timer
  const [medMinutes, setMedMinutes] = useState(10);
  const [medSecondsLeft, setMedSecondsLeft] = useState(10 * 60);
  const [medRunning, setMedRunning] = useState(false);

  // Breathing Pacer
  const [breathPattern, setBreathPattern] = useState<'4-7-8' | 'box'>('4-7-8');
  const [breathActive, setBreathActive] = useState(false);
  const [breathTick, setBreathTick] = useState(0);

  // Soundscape
  const [activeSound, setActiveSound] = useState<SoundscapeId | null>(() => soundEngine.getActiveSoundscape());
  const [volume, setVolume] = useState(0.25);

  // Mood & Encrypted Journal
  const [moodScore, setMoodScore] = useState<1 | 2 | 3 | 4 | 5>(4);
  const [selectedTags, setSelectedTags] = useState<string[]>(['Bình tĩnh']);
  const [journalNote, setJournalNote] = useState('');
  const [savingJournal, setSavingJournal] = useState(false);
  const [journalStatus, setJournalStatus] = useState<string | null>(null);
  const [showCipherPreviewId, setShowCipherPreviewId] = useState<string | null>(null);

  // Habits
  const [newHabitTitle, setNewHabitTitle] = useState('');

  // AI Wellness Companion quick check-in
  const [aiWellnessReply, setAiWellnessReply] = useState<string | null>(null);
  const [aiWellnessError, setAiWellnessError] = useState<string | null>(null);
  const [aiWellnessLoading, setAiWellnessLoading] = useState(false);

  useEffect(() => {
    if (!medRunning) return;
    const id = window.setInterval(() => {
      setMedSecondsLeft((prev) => {
        if (prev <= 1) {
          setMedRunning(false);
          soundEngine.playAlarmChime();
          onLogMeditationMinutes(medMinutes);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [medRunning, medMinutes, onLogMeditationMinutes]);

  useEffect(() => {
    if (!breathActive) return;
    const id = window.setInterval(() => {
      setBreathTick((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [breathActive]);

  const selectMedPreset = (mins: number) => {
    setMedRunning(false);
    setMedMinutes(mins);
    setMedSecondsLeft(mins * 60);
  };

  const formatMmSs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Compute breathing phase & remaining seconds in phase
  const breathCycle = breathPattern === '4-7-8' ? 19 : 16;
  const pos = breathTick % breathCycle;
  let breathPhaseLabel = uiLang === 'vi' ? 'Hít vào chậm' : 'Inhale slowly';
  let breathScaleClass = 'scale-110';
  let breathPhaseCountdown = 4;

  if (breathPattern === '4-7-8') {
    if (pos < 4) {
      breathPhaseLabel = uiLang === 'vi' ? 'Hít vào bằng mũi' : 'Inhale through nose';
      breathScaleClass = 'scale-110';
      breathPhaseCountdown = 4 - pos;
    } else if (pos < 11) {
      breathPhaseLabel = uiLang === 'vi' ? 'Giữ hơi nhẹ nhàng' : 'Hold gently';
      breathScaleClass = 'scale-110';
      breathPhaseCountdown = 11 - pos;
    } else {
      breathPhaseLabel = uiLang === 'vi' ? 'Thở ra từ từ bằng miệng' : 'Exhale slowly';
      breathScaleClass = 'scale-90';
      breathPhaseCountdown = 19 - pos;
    }
  } else {
    if (pos < 4) {
      breathPhaseLabel = uiLang === 'vi' ? 'Hít vào (Box)' : 'Inhale';
      breathScaleClass = 'scale-110';
      breathPhaseCountdown = 4 - pos;
    } else if (pos < 8) {
      breathPhaseLabel = uiLang === 'vi' ? 'Giữ hơi đầy' : 'Hold full';
      breathScaleClass = 'scale-110';
      breathPhaseCountdown = 8 - pos;
    } else if (pos < 12) {
      breathPhaseLabel = uiLang === 'vi' ? 'Thở ra hết' : 'Exhale';
      breathScaleClass = 'scale-90';
      breathPhaseCountdown = 12 - pos;
    } else {
      breathPhaseLabel = uiLang === 'vi' ? 'Giữ trống phổi' : 'Hold empty';
      breathScaleClass = 'scale-90';
      breathPhaseCountdown = 16 - pos;
    }
  }

  const toggleSoundscape = (id: SoundscapeId) => {
    if (activeSound === id) {
      soundEngine.stopSoundscape();
      setActiveSound(null);
    } else {
      musicEngine.stop();
      soundEngine.startSoundscape(id, volume);
      setActiveSound(id);
    }
  };

  const handleVolumeChange = (nextVol: number) => {
    setVolume(nextVol);
    soundEngine.setVolume(nextVol);
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag].slice(0, 4)
    );
  };

  const handleSaveEncryptedJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journalNote.trim()) return;
    setSavingJournal(true);
    setJournalStatus(null);
    try {
      const cleanNote = journalNote.trim();
      const envelope = await encryptPayloadAes256({ note: cleanNote, tags: selectedTags });
      const moodObj = MOOD_LEVELS.find((m) => m.score === moodScore) || MOOD_LEVELS[2];
      const entry: EncryptedMoodJournalEntry = {
        id: `jrn-${Date.now()}`,
        createdAt: new Date().toISOString(),
        moodScore,
        moodLabel: moodObj.labelVi,
        tags: selectedTags,
        note: cleanNote,
        encryptedEnvelope: envelope,
      };
      onAddMoodJournal(entry);
      setJournalNote('');
      setJournalStatus(
        `Đã mã hóa ${envelope.algorithm} (Key ${envelope.keyFingerprint}) và lưu an toàn.`
      );
    } finally {
      setSavingJournal(false);
    }
  };

  const handleAskWellnessCompanion = async () => {
    setAiWellnessLoading(true);
    setAiWellnessError(null);
    const moodObj = MOOD_LEVELS.find((m) => m.score === moodScore) || MOOD_LEVELS[2];
    const promptText = `Tâm trạng hiện tại của tôi: ${moodObj.labelVi} (${moodScore}/5), cảm giác: ${selectedTags.join(', ')}. ${
      journalNote.trim() ? `Chia sẻ thêm: ${journalNote.trim()}` : 'Hãy gợi ý 1 bài tập thở hoặc suy nghĩ tích cực ngắn gọn cho hôm nay.'
    }`;
    try {
      const resp = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona: 'wellness',
          message: promptText,
          uiLanguage: uiLang,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setAiWellnessError(json.error || 'Chưa thể kết nối AI Wellness Companion.');
      } else {
        setAiWellnessReply(json.reply);
      }
    } catch {
      setAiWellnessError('Không thể kết nối tới máy chủ NexaLife OS.');
    } finally {
      setAiWellnessLoading(false);
    }
  };

  const handleAddHabitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHabitTitle.trim()) return;
    onAddHabit(newHabitTitle.trim());
    setNewHabitTitle('');
  };

  return (
    <div className="space-y-6">
      {/* Serene Visual Header */}
      <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 dark:border-slate-800">
        <img
          src="/src/assets/images/wellness_meditation_pond_1794713385922.jpg"
          alt="Không gian thiền định & chăm sóc tinh thần"
          referrerPolicy="no-referrer"
          className="h-52 w-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/70 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-center p-6 sm:p-8">
          <p className="text-xs font-medium text-[#FF6B1A]">
            {uiLang === 'vi'
              ? `Thiền & Sức khỏe Tinh thần · Hôm nay đã thiền ${meditationMinutesToday} phút`
              : `Meditation & Mental Wellness · ${meditationMinutesToday} min practiced today`}
          </p>
          <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
            {uiLang === 'vi' ? 'Nhịp thở An yên & Nhật ký Cảm xúc Mã hóa' : 'Mindful Breathing & Encrypted Mood Journal'}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-slate-300">
            {uiLang === 'vi'
              ? 'Thực hành điều hòa nhịp thở, nghe âm thanh tự nhiên tổng hợp trực tiếp bằng Web Audio API và lưu nhật ký riêng tư bằng chuẩn mã hóa AES-256-GCM.'
              : 'Practice guided breathing, procedural ambient soundscapes, positive habits, and AES-256-GCM encrypted journaling.'}
          </p>
        </div>
      </section>

      {/* Breathing Pacer + Meditation Timer + Soundscapes */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Interactive Breathing Pacer */}
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {uiLang === 'vi' ? 'Điều hòa Nhịp thở' : 'Breathing Pacer'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {breathPattern === '4-7-8' ? 'Kỹ thuật 4-7-8 (An thần & ngủ ngon)' : 'Box Breathing 4-4-4-4 (Giảm lo âu)'}
              </p>
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setBreathPattern('4-7-8');
                  setBreathTick(0);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  breathPattern === '4-7-8'
                    ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                    : 'bg-stone-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                4-7-8
              </button>
              <button
                type="button"
                onClick={() => {
                  setBreathPattern('box');
                  setBreathTick(0);
                }}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                  breathPattern === 'box'
                    ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                    : 'bg-stone-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                Box
              </button>
            </div>
          </div>

          <div className="my-8 flex flex-col items-center justify-center">
            <div
              className={`alw-breathe-ring flex h-40 w-40 flex-col items-center justify-center rounded-full border-4 border-[#FF6B1A]/45 bg-orange-50 transition-transform duration-1000 dark:bg-orange-950/35 ${
                breathActive ? breathScaleClass : 'scale-100'
              }`}
            >
              <Wind className="h-5 w-5 text-orange-600 dark:text-[#FF6B1A]" />
              <div className="mt-1 font-mono text-2xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {breathActive ? `${breathPhaseCountdown}s` : 'Ready'}
              </div>
              <div className="mt-0.5 px-3 text-center text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">
                {breathActive ? breathPhaseLabel : uiLang === 'vi' ? 'Nhấn bắt đầu' : 'Press start'}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setBreathActive((prev) => !prev)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-[#FF6B1A] dark:text-zinc-950 dark:hover:bg-[#ff7f38]"
          >
            {breathActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            <span>{breathActive ? 'Tạm dừng nhịp thở' : 'Bắt đầu dẫn nhịp thở'}</span>
          </button>
        </section>

        {/* Meditation Timer & Soundscapes */}
        <section className="space-y-6 lg:col-span-7">
          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {uiLang === 'vi' ? 'Bộ đếm giờ Thiền định' : 'Meditation Timer'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Chuông đồng thanh nhẹ khi hoàn tất và cộng vào phút thiền hôm nay.
                </p>
              </div>
              <div className="flex gap-1.5">
                {[5, 10, 15, 20].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => selectMedPreset(m)}
                    className={`rounded-lg px-2.5 py-1.5 font-mono text-xs font-medium tabular-nums ${
                      medMinutes === m
                        ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                        : 'border border-stone-200 text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {m}p
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-zinc-800 dark:bg-[#0D0F14]">
              <div className="font-mono text-4xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-100">
                {formatMmSs(medSecondsLeft)}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMedRunning((r) => !r)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
                >
                  {medRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span>{medRunning ? 'Tạm dừng' : 'Bắt đầu'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => selectMedPreset(medMinutes)}
                  aria-label="Đặt lại đồng hồ thiền"
                  className="rounded-lg border border-stone-200 bg-white p-2 text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-[#1A1D26] dark:text-zinc-200"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMedRunning(false);
                    soundEngine.playAlarmChime();
                    onLogMeditationMinutes(medMinutes);
                  }}
                  className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-[#1A1D26] dark:text-zinc-200"
                >
                  Ghi nhận +{medMinutes}p
                </button>
              </div>
            </div>
          </div>

          {/* Web Audio Procedural Soundscapes */}
          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  {uiLang === 'vi' ? 'Âm thanh Tự nhiên & Sóng não' : 'Ambient Soundscapes'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tổng hợp âm thanh thời gian thực (không cần tải file MP3 ngoài).
                </p>
              </div>
              <div className="flex items-center gap-2">
                {activeSound ? (
                  <Volume2 className="h-4 w-4 text-orange-600 dark:text-[#FF6B1A]" />
                ) : (
                  <VolumeX className="h-4 w-4 text-slate-400" />
                )}
                <input
                  type="range"
                  min={0.05}
                  max={0.6}
                  step={0.05}
                  value={volume}
                  aria-label="Âm lượng âm thanh nền"
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="w-24 accent-orange-600 dark:accent-[#FF6B1A]"
                />
              </div>
            </div>

            <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {SOUNDSCAPES.map((sc) => {
                const isPlaying = activeSound === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    onClick={() => toggleSoundscape(sc.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      isPlaying
                        ? 'border-orange-500 bg-orange-50 dark:border-[#FF6B1A] dark:bg-orange-950/35'
                        : 'border-stone-200 hover:bg-stone-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {uiLang === 'vi' ? sc.nameVi : sc.nameEn}
                      </span>
                      {isPlaying && (
                        <span className="text-xs font-semibold text-orange-600 dark:text-[#FF6B1A]">
                          Đang phát
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sc.detail}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Encrypted Emotion Journal + Positive Habits */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Mood & AES-256 Encrypted Journal */}
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-7 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-orange-600 dark:text-[#FF6B1A]" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {uiLang === 'vi' ? 'Nhật ký Cảm xúc Mã hóa AES-256-GCM' : 'AES-256-GCM Encrypted Journal'}
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Mã hóa đầu cuối trên thiết bị
            </span>
          </div>

          <form onSubmit={handleSaveEncryptedJournal} className="mt-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Mức năng lượng & cảm xúc hôm nay
              </label>
              <div className="mt-2 grid grid-cols-5 gap-2">
                {MOOD_LEVELS.map((m) => (
                  <button
                    key={m.score}
                    type="button"
                    onClick={() => setMoodScore(m.score)}
                    className={`rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors ${
                      moodScore === m.score
                        ? 'border-orange-600 bg-orange-600 text-white dark:border-[#FF6B1A] dark:bg-[#FF6B1A] dark:text-zinc-950'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="font-mono font-bold tabular-nums">{m.score}/5</div>
                    <div className="mt-0.5 truncate text-[11px]">{m.labelVi}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {MOOD_TAGS.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      active
                        ? 'border-orange-500 bg-orange-50 text-orange-900 dark:border-[#FF6B1A] dark:bg-orange-950/40 dark:text-orange-200'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>

            <div>
              <textarea
                rows={3}
                value={journalNote}
                onChange={(e) => setJournalNote(e.target.value)}
                placeholder="Viết điều bạn trân trọng hôm nay hoặc điều khiến bạn bận tâm... Nội dung sẽ được mã hóa AES-256-GCM trước khi lưu."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={savingJournal || !journalNote.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 dark:bg-[#FF6B1A] dark:text-zinc-950"
              >
                <Lock className="h-4 w-4" />
                <span>{savingJournal ? 'Đang mã hóa...' : 'Mã hóa & Lưu nhật ký'}</span>
              </button>
              <button
                type="button"
                disabled={aiWellnessLoading}
                onClick={handleAskWellnessCompanion}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Sparkles className="h-4 w-4 text-orange-600 dark:text-[#FF6B1A]" />
                <span>{aiWellnessLoading ? 'AI đang lắng nghe...' : 'Gợi ý từ AI Wellness'}</span>
              </button>
            </div>

            {journalStatus && (
              <p className="text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">{journalStatus}</p>
            )}
            {aiWellnessError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                {aiWellnessError}
              </div>
            )}
            {aiWellnessReply && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3.5 text-sm leading-relaxed text-slate-800 dark:border-orange-900/60 dark:bg-orange-950/35 dark:text-slate-200">
                {aiWellnessReply}
              </div>
            )}
          </form>

          {/* Stored Encrypted Journal Entries */}
          <div className="mt-6 space-y-2.5 border-t border-slate-200 pt-4 dark:border-slate-800">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Nhật ký đã lưu ({moodJournals.length})
            </h3>
            {moodJournals.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chưa có ghi chú nào. Hãy viết dòng nhật ký đầu tiên để kiểm tra mã hóa AES-256-GCM.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {moodJournals.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-zinc-800 dark:bg-[#0D0F14]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>
                        {entry.moodLabel} ({entry.moodScore}/5) ·{' '}
                        {new Date(entry.createdAt).toLocaleString('vi-VN')}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setShowCipherPreviewId((cur) => (cur === entry.id ? null : entry.id))
                        }
                        className="font-mono text-[11px] text-orange-600 hover:underline dark:text-[#FF6B1A]"
                      >
                        {showCipherPreviewId === entry.id ? 'Ẩn ciphertext' : 'Xem bản mã AES'}
                      </button>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-800 dark:text-slate-200">{entry.note}</p>
                    {showCipherPreviewId === entry.id && entry.encryptedEnvelope && (
                      <div className="mt-2 rounded bg-slate-900 p-2 font-mono text-[11px] text-emerald-300 break-all">
                        {entry.encryptedEnvelope.algorithm} · IV: {entry.encryptedEnvelope.ivHex} ·{' '}
                        {entry.encryptedEnvelope.ciphertextBase64.slice(0, 72)}...
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Positive Habit Builder */}
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            {uiLang === 'vi' ? 'Xây dựng Thói quen Tích cực' : 'Positive Habit Builder'}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Duy trì chuỗi ngày (streak) nhỏ mỗi ngày để cải thiện sức khỏe tinh thần bền vững.
          </p>

          <form onSubmit={handleAddHabitSubmit} className="mt-4 flex gap-2">
            <input
              type="text"
              value={newHabitTitle}
              onChange={(e) => setNewHabitTitle(e.target.value)}
              placeholder="Thêm thói quen mới (vd: Đọc sách 15 phút)..."
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              aria-label="Thêm thói quen"
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-[#FF6B1A] dark:text-zinc-950"
            >
              <Plus className="h-4 w-4" />
              <span>Thêm</span>
            </button>
          </form>

          <div className="mt-4 space-y-2.5">
            {habits.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
              >
                <button
                  type="button"
                  onClick={() => onToggleHabit(h.id)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  {h.completedToday ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-orange-600 dark:text-[#FF6B1A]" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
                  )}
                  <div className="min-w-0">
                    <div
                      className={`truncate text-sm font-medium ${
                        h.completedToday
                          ? 'text-slate-400 line-through dark:text-slate-500'
                          : 'text-slate-900 dark:text-slate-100'
                      }`}
                    >
                      {h.title}
                    </div>
                    <div className="font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
                      Chuỗi {h.streak} ngày
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteHabit(h.id)}
                  aria-label={`Xóa thói quen ${h.title}`}
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
