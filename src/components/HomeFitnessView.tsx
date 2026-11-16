import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Image as ImageIcon,
  Loader2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  VideoOff,
  Volume2,
  Wind,
  Youtube,
} from 'lucide-react';
import {
  EXERCISE_CATEGORY_LABELS,
  EXERCISE_LIBRARY,
  EXERCISE_SPORT_GROUPS,
} from '../data/exercises';
import type {
  ExerciseCategory,
  ExerciseItem,
  VoiceGender,
  WorkoutLogEntry,
} from '../types/lifeworld';
import { calculateWorkoutCalories } from '../utils/healthEngine';
import { soundEngine } from '../utils/soundEngine';
import { speakWithAiVoice } from '../utils/voiceEngine';
import { ExerciseVideoPlayer } from './ExerciseVideoPlayer';

interface HomeFitnessViewProps {
  weightKg: number;
  cameraAllowed: boolean;
  workouts: WorkoutLogEntry[];
  claudeConfigured?: boolean;
  aiVoiceGender?: VoiceGender;
  vietnameseRegion?: 'north' | 'south';
  isWorkoutMusicPlaying?: boolean;
  onPlayWorkoutMusic?: () => void;
  onOpenMusicStudio?: () => void;
  onChangeVoiceGender?: (gender: VoiceGender) => void;
  onGrantCameraPermission: () => void;
  onLogWorkout: (exercise: ExerciseItem, durationMin: number, calories: number) => void;
}

function splitStepHeadingAndBody(rawStep: string): { heading: string | null; body: string } {
  const colonIdx = rawStep.indexOf(':');
  if (colonIdx > 2 && colonIdx <= 44) {
    return {
      heading: rawStep.slice(0, colonIdx).trim(),
      body: rawStep.slice(colonIdx + 1).trim(),
    };
  }
  return { heading: null, body: rawStep };
}

export const HomeFitnessView: React.FC<HomeFitnessViewProps> = ({
  weightKg,
  cameraAllowed,
  workouts,
  claudeConfigured = false,
  aiVoiceGender = 'female',
  vietnameseRegion = 'north',
  isWorkoutMusicPlaying = false,
  onPlayWorkoutMusic,
  onOpenMusicStudio,
  onChangeVoiceGender,
  onGrantCameraPermission,
  onLogWorkout,
}) => {
  const [selectedSportGroup, setSelectedSportGroup] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<'all' | ExerciseCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [activeExercise, setActiveExercise] = useState<ExerciseItem>(EXERCISE_LIBRARY[0]);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [stepJumpRequest, setStepJumpRequest] = useState<{ index: number; token: number } | null>(null);
  const [visualModeRequest, setVisualModeRequest] = useState<{
    mode: 'kinematic' | 'photo' | 'youtube';
    token: number;
  } | null>(null);

  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [isSessionRunning, setIsSessionRunning] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(EXERCISE_LIBRARY[0].durationMinutes * 60);

  // Camera Posture AI state
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [analyzingPosture, setAnalyzingPosture] = useState(false);
  const [postureReport, setPostureReport] = useState<{
    visibilityOk: boolean;
    formSummary: string;
    detectedErrors: string[];
    correctionCues: string[];
    safetyTip: string;
  } | null>(null);

  // Claude Exercise Content Generation state
  const [claudePrompt, setClaudePrompt] = useState('');
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeOutput, setClaudeOutput] = useState<{
    content: string;
    model: string;
    exerciseName: string;
  } | null>(null);
  const [claudeError, setClaudeError] = useState<string | null>(null);
  const [claudeCopied, setClaudeCopied] = useState(false);

  const sportGroupCounts = useMemo(() => {
    const counts: Record<string, number> = { all: EXERCISE_LIBRARY.length };
    for (const grp of EXERCISE_SPORT_GROUPS) {
      if (grp.id === 'all') continue;
      counts[grp.id] = EXERCISE_LIBRARY.filter((ex) =>
        ex.categories.some((c) => grp.categories.includes(c))
      ).length;
    }
    return counts;
  }, []);

  const filteredExercises = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const activeGroup = EXERCISE_SPORT_GROUPS.find((g) => g.id === selectedSportGroup);

    return EXERCISE_LIBRARY.filter((ex) => {
      if (selectedSportGroup !== 'all' && activeGroup && activeGroup.categories.length > 0) {
        if (!ex.categories.some((c) => activeGroup.categories.includes(c))) {
          return false;
        }
      }
      if (selectedCategory !== 'all' && !ex.categories.includes(selectedCategory)) {
        return false;
      }
      if (q) {
        const haystack = `${ex.name} ${ex.nameEn} ${ex.equipment} ${ex.repsOrHold}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [selectedSportGroup, selectedCategory, searchQuery]);

  // Keep activeExercise synced when filters exclude the currently selected item
  useEffect(() => {
    if (
      filteredExercises.length > 0 &&
      !filteredExercises.some((ex) => ex.id === activeExercise.id)
    ) {
      setActiveExercise(filteredExercises[0]);
    }
  }, [filteredExercises, activeExercise.id]);

  useEffect(() => {
    setIsSessionRunning(false);
    setActiveStepIndex(0);
    setRemainingSeconds(activeExercise.durationMinutes * 60);
  }, [activeExercise.id]);

  useEffect(() => {
    if (!isSessionRunning) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsSessionRunning(false);
          const kcal = calculateWorkoutCalories(
            activeExercise.met,
            weightKg,
            activeExercise.durationMinutes
          );
          soundEngine.playAlarmChime();
          onLogWorkout(activeExercise, activeExercise.durationMinutes, kcal);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isSessionRunning, activeExercise, weightKg, onLogWorkout]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const startCameraStream = async () => {
    setCameraError(null);
    if (!cameraAllowed) {
      onGrantCameraPermission();
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Trình duyệt hiện tại không hỗ trợ truy cập camera.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch {
      setCameraError('Không thể mở camera. Vui lòng cấp quyền camera trong trình duyệt.');
    }
  };

  const stopCameraStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  const analyzeCameraSnapshot = async () => {
    if (!videoRef.current || !cameraActive) return;
    setAnalyzingPosture(true);
    setCameraError(null);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64 = dataUrl.split(',')[1];

      const resp = await fetch('/api/fitness/posture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseName: activeExercise.name,
          imageBase64: base64,
          imageMimeType: 'image/jpeg',
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setCameraError(json.error || 'Không thể phân tích tư thế.');
      } else {
        setPostureReport(json);
      }
    } catch {
      setCameraError('Lỗi kết nối tới máy chủ phân tích tư thế AI.');
    } finally {
      setAnalyzingPosture(false);
    }
  };

  const estimatedKcal = calculateWorkoutCalories(
    activeExercise.met,
    weightKg,
    activeExercise.durationMinutes
  );

  const openYoutubeTutorial = () => {
    setVisualModeRequest({ mode: 'youtube', token: Date.now() });
    playerContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const generateWithClaude = async (customTopic?: string) => {
    if (claudeLoading) return;
    const topic = (customTopic ?? claudePrompt).trim();
    setClaudeLoading(true);
    setClaudeError(null);
    setClaudeCopied(false);
    try {
      const resp = await fetch('/api/claude/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: topic.toLowerCase().includes('kịch bản') ? 'video_script' : 'workout_guide',
          topic: topic || 'Tạo biến thể phù hợp người mới, mẹo hít thở và lỗi kỹ thuật cần tránh.',
          tone: 'coach',
          length: 'medium',
          language: 'vi',
          exerciseContext: {
            name: activeExercise.name,
            equipment: activeExercise.equipment,
            repsOrHold: activeExercise.repsOrHold,
            steps: activeExercise.steps,
          },
        }),
      });
      const json = (await resp.json()) as {
        content?: string;
        model?: string;
        error?: string;
      };
      if (!resp.ok) {
        setClaudeError(
          json.error || 'Chưa thể tạo nội dung với Claude. Vui lòng kiểm tra ANTHROPIC_API_KEY.'
        );
      } else {
        setClaudeOutput({
          content: json.content || '',
          model: json.model || 'claude-sonnet-4-5',
          exerciseName: activeExercise.name,
        });
      }
    } catch {
      setClaudeError('Lỗi kết nối tới máy chủ Claude API.');
    } finally {
      setClaudeLoading(false);
    }
  };

  const handleJumpAndSpeakStep = (idx: number, speak: boolean) => {
    setActiveStepIndex(idx);
    setStepJumpRequest({ index: idx, token: Date.now() });
    if (speak) {
      void speakWithAiVoice({
        text: `Bước ${idx + 1}: ${activeExercise.steps[idx]}`,
        languageCode: 'vi',
        bcp47: 'vi-VN',
        gender: aiVoiceGender,
        rate: 0.96,
        styleContext: 'fitness',
        vietnameseRegion,
      });
    }
  };

  const resetFilters = () => {
    setSelectedSportGroup('all');
    setSelectedCategory('all');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* Banner & Sport Hub Header */}
      <section className="grid grid-cols-1 overflow-hidden rounded-xl border border-stone-200/90 bg-white/95 lg:grid-cols-12 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
        <div className="p-5 sm:p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-orange-600 dark:text-[#FF6B1A]">
              Yoga · Gym Tại nhà · Calisthenics · Đá bóng · Chạy bộ & Boxing · Pilates
            </p>
            {(onPlayWorkoutMusic || onOpenMusicStudio) && (
              <div className="flex flex-wrap items-center gap-2">
                {onPlayWorkoutMusic && (
                  <button
                    type="button"
                    onClick={onPlayWorkoutMusic}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      isWorkoutMusicPlaying
                        ? 'bg-rose-500 text-white'
                        : 'border border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300'
                    }`}
                  >
                    <Music2 className="h-3.5 w-3.5 shrink-0" />
                    <span>{isWorkoutMusicPlaying ? 'Đang phát Phonk' : 'Nhạc Phonk / Gym'}</span>
                  </button>
                )}
                {onOpenMusicStudio && (
                  <button
                    type="button"
                    onClick={onOpenMusicStudio}
                    className="rounded-lg border border-stone-300/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-stone-100 whitespace-nowrap shrink-0 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Thể loại nhạc
                  </button>
                )}
              </div>
            )}
          </div>

          <h1 className="mt-1.5 font-display text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Trung tâm Tập luyện Đa môn Tại nhà ({EXERCISE_LIBRARY.length} Bài tập Chuẩn)
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            Đầy đủ Yoga, Gym tạ đơn, Calisthenics, Thể lực Đá bóng FIFA 11+, Chạy bộ và Shadow Boxing — kèm ảnh tư thế chuẩn, chuyển động AI, video YouTube mẫu và chuẩn hóa đơn vị từng bước.
          </p>

          {/* Sport Group Segmented Tabs */}
          <div className="mt-4 flex flex-wrap gap-1.5">
            {EXERCISE_SPORT_GROUPS.map((group) => {
              const active = selectedSportGroup === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setSelectedSportGroup(group.id);
                    setSelectedCategory('all');
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                    active
                      ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                      : 'border border-stone-200 text-zinc-600 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                  }`}
                >
                  {group.label} ({sportGroupCounts[group.id] ?? 0})
                </button>
              );
            })}
          </div>

          {/* Search & Detailed Sub-category Filter */}
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-12">
            <label className="relative sm:col-span-7">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm bài tập: Kéo xà, Đá bóng, Squat, Yoga, Tạ đơn..."
                className="w-full rounded-lg border border-stone-300/90 bg-white py-2 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-[#0A0B0E] dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </label>
            <select
              aria-label="Lọc theo nhóm mục tiêu bài tập"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as 'all' | ExerciseCategory)}
              className="rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-medium text-zinc-800 focus:border-orange-500 focus:outline-none sm:col-span-5 dark:border-zinc-700 dark:bg-[#0A0B0E] dark:text-zinc-100"
            >
              <option value="all">Tất cả mục tiêu chi tiết</option>
              {(Object.keys(EXERCISE_CATEGORY_LABELS) as ExerciseCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {EXERCISE_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative hidden min-h-[190px] md:block lg:col-span-4">
          <img
            src="/src/assets/images/nexalife_fitness_banner_1794823888222.jpg"
            alt="NexaLife OS Fitness Studio"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#13151C]/70 via-transparent to-transparent" />
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left Exercise Directory Column */}
        <div className="space-y-2.5 lg:col-span-5 lg:sticky lg:top-4">
          <div className="flex items-center justify-between px-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-semibold tabular-nums">
              Đang hiển thị {filteredExercises.length} / {EXERCISE_LIBRARY.length} bài tập
            </span>
            {(selectedSportGroup !== 'all' || selectedCategory !== 'all' || searchQuery) && (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex items-center gap-1 font-medium text-orange-600 hover:underline dark:text-[#FF6B1A]"
              >
                <RotateCcw className="h-3 w-3" />
                <span>Xóa bộ lọc</span>
              </button>
            )}
          </div>

          <div className="space-y-2.5 lg:max-h-[820px] lg:overflow-y-auto lg:pr-1">
            {filteredExercises.length === 0 ? (
              <div className="rounded-xl border border-stone-200/90 bg-white/95 p-6 text-center dark:border-zinc-800/90 dark:bg-[#13151C]/95">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  Không tìm thấy bài tập phù hợp với từ khóa &ldquo;{searchQuery}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-3 rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
                >
                  Hiển thị lại tất cả bài tập
                </button>
              </div>
            ) : (
              filteredExercises.map((ex) => {
                const selected = ex.id === activeExercise.id;
                const kcal = calculateWorkoutCalories(ex.met, weightKg, ex.durationMinutes);
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setActiveExercise(ex)}
                    className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                      selected
                        ? 'border-orange-500 bg-orange-50/90 shadow-sm dark:border-[#FF6B1A]/80 dark:bg-orange-950/35'
                        : 'border-stone-200/90 bg-white/95 hover:border-orange-400/60 dark:border-zinc-800/90 dark:bg-[#13151C]/95'
                    }`}
                  >
                    <div className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-stone-200 bg-zinc-900 dark:border-zinc-700">
                      {!brokenImages[ex.id] ? (
                        <img
                          src={ex.guideImage}
                          alt={ex.name}
                          referrerPolicy="no-referrer"
                          onError={() => setBrokenImages((prev) => ({ ...prev, [ex.id]: true }))}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[#FF6B1A]">
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate font-display text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          {ex.name}
                        </h3>
                        <span className="font-mono text-xs font-semibold text-orange-600 tabular-nums shrink-0 dark:text-[#FF6B1A]">
                          ~{kcal} kcal
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-zinc-600 tabular-nums dark:text-zinc-300">
                        {ex.difficulty} · {ex.durationMinutes} phút · {ex.sets} hiệp · Nghỉ {ex.restSeconds} giây
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {ex.repsOrHold} · Dụng cụ: {ex.equipment}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Guided Exercise Stage & Camera Posture AI */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-xl border border-stone-200/90 bg-white/95 p-5 sm:p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex flex-col gap-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-relaxed text-zinc-500 tabular-nums dark:text-zinc-400">
                  {activeExercise.difficulty} · {activeExercise.durationMinutes} phút · {activeExercise.sets} hiệp · Nghỉ {activeExercise.restSeconds} giây · Ước tính {estimatedKcal} kcal
                </p>
                <h2 className="mt-1 font-display text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  {activeExercise.name}
                </h2>
                <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                  Khối lượng: <span className="font-semibold tabular-nums">{activeExercise.repsOrHold}</span> · Dụng cụ: {activeExercise.equipment}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="font-mono text-xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
                  {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:
                  {String(remainingSeconds % 60).padStart(2, '0')}
                </span>
                <button
                  type="button"
                  onClick={() => setIsSessionRunning((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 whitespace-nowrap shrink-0 dark:bg-[#FF6B1A] dark:text-zinc-950"
                >
                  {isSessionRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  <span>{isSessionRunning ? 'Tạm dừng' : 'Tập ngay'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSessionRunning(false);
                    onLogWorkout(activeExercise, activeExercise.durationMinutes, estimatedKcal);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-stone-100 whitespace-nowrap shrink-0 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-orange-600 dark:text-[#FF6B1A]" />
                  <span>Hoàn thành</span>
                </button>
              </div>
            </div>

            <div ref={playerContainerRef} className="mt-4">
              <ExerciseVideoPlayer
                exercise={activeExercise}
                defaultVoiceGender={aiVoiceGender}
                vietnameseRegion={vietnameseRegion}
                onChangeVoiceGender={onChangeVoiceGender}
                onActiveStepChange={setActiveStepIndex}
                externalStepJump={stepJumpRequest}
                externalVisualModeRequest={visualModeRequest}
              />
            </div>

            {/* Structured Breathing Box */}
            <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50/75 p-3.5 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold">
                  <Wind className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-300" />
                  <span>Hướng dẫn hít thở chuẩn kỹ thuật</span>
                </div>
                {activeExercise.breathCycleSec && (
                  <span className="font-mono text-[11px] font-semibold text-sky-700 tabular-nums dark:text-sky-300">
                    Hít {activeExercise.breathCycleSec.inhale} giây · Giữ {activeExercise.breathCycleSec.hold} giây · Thở {activeExercise.breathCycleSec.exhale} giây
                  </span>
                )}
              </div>
              <p className="mt-1.5 leading-relaxed">{activeExercise.breathingGuide}</p>
            </div>

            {/* Synchronized Interactive Step-by-Step Guide Cards */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Hướng dẫn từng bước ({activeExercise.steps.length} bước)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Chạm vào từng bước để đồng bộ khung hình hoặc nghe giọng AI đọc riêng bước đó.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openYoutubeTutorial}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 whitespace-nowrap shrink-0 dark:text-rose-300"
                >
                  <Youtube className="h-3.5 w-3.5 shrink-0" />
                  <span>Chưa rõ động tác? Xem YouTube</span>
                </button>
              </div>

              <ol className="mt-3 space-y-2.5">
                {activeExercise.steps.map((step, idx) => {
                  const isCurrent = idx === activeStepIndex;
                  const { heading, body } = splitStepHeadingAndBody(step);
                  return (
                    <li
                      key={idx}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                        isCurrent
                          ? 'border-orange-500/75 bg-orange-50/85 dark:border-[#FF6B1A]/70 dark:bg-orange-950/30'
                          : 'border-stone-200/90 bg-stone-50/80 hover:border-orange-400/50 dark:border-zinc-800 dark:bg-[#0D0F14]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleJumpAndSpeakStep(idx, false)}
                        className={`mt-0.5 rounded-md px-2 py-1 font-mono text-xs font-bold tabular-nums shrink-0 transition-colors ${
                          isCurrent
                            ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                            : 'bg-stone-200/80 text-zinc-700 hover:bg-orange-500 hover:text-white dark:bg-zinc-800 dark:text-zinc-200'
                        }`}
                      >
                        Bước {String(idx + 1).padStart(2, '0')}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleJumpAndSpeakStep(idx, false)}
                        className="min-w-0 flex-1 text-left"
                      >
                        {heading && (
                          <div className="text-xs font-bold text-orange-700 dark:text-orange-300">
                            {heading}
                          </div>
                        )}
                        <p className="mt-0.5 text-xs sm:text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                          {body}
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleJumpAndSpeakStep(idx, true)}
                        aria-label={`Đọc hướng dẫn bước ${idx + 1}`}
                        title="Đọc hướng dẫn bước này bằng giọng AI"
                        className="mt-0.5 rounded-lg border border-stone-200 bg-white p-1.5 text-zinc-600 hover:border-orange-500 hover:text-orange-600 shrink-0 dark:border-zinc-700 dark:bg-[#13151C] dark:text-zinc-300 dark:hover:text-[#FF6B1A]"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* Posture Errors & Safety Warnings */}
            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 dark:border-amber-900 dark:bg-amber-950/30">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span>Lỗi tư thế cần tránh</span>
                </div>
                <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                  {activeExercise.postureErrors.map((err, i) => (
                    <li key={i}>• {err}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-3.5 dark:border-rose-900 dark:bg-rose-950/30">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-900 dark:text-rose-200">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                  <span>Giới hạn an toàn</span>
                </div>
                <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-rose-900/90 dark:text-rose-200/90">
                  {activeExercise.safetyWarnings.map((warn, i) => (
                    <li key={i}>• {warn}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Claude AI Exercise Content & Variant Studio */}
          <section className="rounded-xl border border-stone-200/90 bg-white/95 p-5 sm:p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                  Biên soạn Giáo án & Nội dung Bài tập với Claude
                </h3>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Tạo biến thể giảm tải, lộ trình tăng tiến hoặc kịch bản video hướng dẫn riêng cho bài &ldquo;
                  {activeExercise.name}&rdquo; · {claudeConfigured ? 'Claude API sẵn sàng' : 'Cần ANTHROPIC_API_KEY trên máy chủ'}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                'Tạo biến thể nhẹ nhàng cho người mới hoặc đau khớp gối',
                'Tăng độ khó nâng cao & mẹo tối ưu lực phát cơ',
                'Lập lịch tập 3 buổi/tuần kết hợp bài tập này',
                'Viết kịch bản video ngắn 45 giây hướng dẫn kỹ thuật bài này',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={claudeLoading}
                  onClick={() => {
                    setClaudePrompt(preset);
                    void generateWithClaude(preset);
                  }}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:border-orange-500 hover:text-orange-700 disabled:opacity-60 dark:border-zinc-700 dark:bg-[#0D0F14] dark:text-zinc-200 dark:hover:border-[#FF6B1A] dark:hover:text-orange-300"
                >
                  {preset}
                </button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void generateWithClaude();
              }}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={claudePrompt}
                onChange={(e) => setClaudePrompt(e.target.value)}
                placeholder="Nhập yêu cầu để Claude biên soạn (vd: biến thể không dùng tạ, lưu ý đau thắt lưng...)"
                className="flex-1 min-w-[220px] rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-[#0A0B0E] dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={claudeLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 whitespace-nowrap shrink-0 dark:bg-[#FF6B1A] dark:text-zinc-950"
              >
                {claudeLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{claudeLoading ? 'Claude đang viết...' : 'Tạo nội dung Claude'}</span>
              </button>
            </form>

            {claudeError && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {claudeError}
              </p>
            )}

            {claudeOutput && (
              <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs dark:border-zinc-800 dark:bg-[#0D0F14]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2 dark:border-zinc-800">
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                    Claude ({claudeOutput.model}) · {claudeOutput.exerciseName}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(claudeOutput.content);
                        setClaudeCopied(true);
                        window.setTimeout(() => setClaudeCopied(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-stone-300 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {claudeCopied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                      <span>{claudeCopied ? 'Đã sao chép' : 'Sao chép'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void speakWithAiVoice({
                          text: claudeOutput.content.slice(0, 550),
                          languageCode: 'vi',
                          bcp47: 'vi-VN',
                          gender: aiVoiceGender,
                          rate: 0.96,
                          styleContext: 'fitness',
                          vietnameseRegion,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded border border-orange-500/40 bg-orange-500/10 px-2 py-1 text-[11px] font-semibold text-orange-700 hover:bg-orange-500/20 dark:text-orange-300"
                    >
                      <Volume2 className="h-3 w-3" />
                      <span>Đọc AI</span>
                    </button>
                  </div>
                </div>
                <div className="mt-2.5 whitespace-pre-wrap leading-relaxed text-zinc-700 dark:text-zinc-200">
                  {claudeOutput.content}
                </div>
              </div>
            )}
          </section>

          {/* AI Camera Posture Analysis */}
          <section className="rounded-xl border border-stone-200/90 bg-white/95 p-5 sm:p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display text-base font-bold text-zinc-900 dark:text-zinc-100">
                  AI Phân tích Tư thế qua Camera
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Chỉ kích hoạt camera khi bạn bấm cho phép. Hình ảnh chỉ gửi đi khi bạn bấm nút kiểm tra tư thế.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!cameraActive ? (
                  <button
                    type="button"
                    onClick={startCameraStream}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap dark:bg-[#FF6B1A] dark:text-zinc-950"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Bật Camera</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={analyzingPosture}
                      onClick={analyzeCameraSnapshot}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 whitespace-nowrap dark:bg-[#FF6B1A] dark:text-zinc-950"
                    >
                      <span>{analyzingPosture ? 'Đang phân tích...' : 'Chụp & Kiểm tra Tư thế AI'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={stopCameraStream}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-3 py-2 text-xs font-medium text-zinc-700 whitespace-nowrap dark:border-zinc-700 dark:text-zinc-200"
                    >
                      <VideoOff className="h-3.5 w-3.5" />
                      <span>Tắt</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {cameraError && (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                {cameraError}
              </p>
            )}

            {cameraActive && (
              <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-black dark:border-zinc-800">
                <video ref={videoRef} autoPlay playsInline muted className="h-56 w-full object-cover" />
              </div>
            )}

            {postureReport && (
              <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs dark:border-zinc-800 dark:bg-[#0D0F14]">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  Nhận định AI: {postureReport.formSummary}
                </div>
                {postureReport.correctionCues.length > 0 && (
                  <ul className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
                    {postureReport.correctionCues.map((cue, idx) => (
                      <li key={idx}>• {cue}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-amber-700 dark:text-amber-400">
                  Lưu ý an toàn: {postureReport.safetyTip}
                </p>
              </div>
            )}

            {workouts.length > 0 && (
              <div className="mt-5 border-t border-stone-100 pt-4 dark:border-zinc-800">
                <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  Lịch sử tập gần đây ({workouts.length} buổi)
                </div>
                <div className="mt-2 space-y-1.5">
                  {workouts.slice(0, 4).map((w) => (
                    <div key={w.id} className="flex items-center justify-between gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                      <span className="truncate">{w.exerciseName}</span>
                      <span className="font-mono tabular-nums text-zinc-500 shrink-0 dark:text-zinc-400">
                        {w.durationMinutes} phút · {w.caloriesBurned} kcal
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
