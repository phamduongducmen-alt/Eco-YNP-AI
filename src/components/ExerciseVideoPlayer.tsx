import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Check,
  ExternalLink,
  Film,
  Globe2,
  Image as ImageIcon,
  Link2,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  Wind,
  Youtube,
} from 'lucide-react';
import { AI_COUNTRY_VOICES, getCountryVoiceProfile } from '../data/voices';
import type { ExerciseItem, VoiceGender } from '../types/lifeworld';
import { buildYouTubeFallbackLinks } from '../utils/claudeContent';
import { parseYouTubeEmbedUrl } from '../utils/externalMusic';
import {
  blendAthletePoseFrames,
  computeAthletePoseFrame,
  getEquipmentPropLabelVi,
  getExerciseEquipmentProp,
  renderVolumetricAthleteCanvas,
  type AthletePoseFrame,
} from '../utils/kinematicMotion';
import { speakWithAiVoice, stopActiveAiVoice } from '../utils/voiceEngine';
import { Exercise3DStage } from './Exercise3DStage';

export type PlayerVisualMode = 'studio_3d' | 'kinematic' | 'photo' | 'youtube' | 'ai_cloud';

interface ExerciseVideoPlayerProps {
  exercise: ExerciseItem;
  defaultVoiceGender?: VoiceGender;
  vietnameseRegion?: 'north' | 'south';
  onChangeVoiceGender?: (gender: VoiceGender) => void;
  onActiveStepChange?: (stepIndex: number) => void;
  externalStepJump?: { index: number; token: number } | null;
  externalVisualModeRequest?: { mode: 'kinematic' | 'photo' | 'youtube'; token: number } | null;
}

const STEP_DURATION_SEC = 8;
const TRANSITION_DURATION_MS = 320;

export const ExerciseVideoPlayer: React.FC<ExerciseVideoPlayerProps> = ({
  exercise,
  defaultVoiceGender = 'female',
  vietnameseRegion = 'north',
  onChangeVoiceGender,
  onActiveStepChange,
  externalStepJump,
  externalVisualModeRequest,
}) => {
  const [playing, setPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [speed, setSpeed] = useState<0.75 | 1 | 1.25>(1);
  const [voiceCoach, setVoiceCoach] = useState(false);
  const [voiceGender, setVoiceGender] = useState<VoiceGender>(defaultVoiceGender);
  const [coachLangCode, setCoachLangCode] = useState<string>('vi');
  const [expanded, setExpanded] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);
  const [visualMode, setVisualMode] = useState<PlayerVisualMode>('studio_3d');
  const [transitionActive, setTransitionActive] = useState(false);

  // Inline YouTube Tutorial state (curated per exercise OR pasted custom link)
  const [customYoutubeUrlInput, setCustomYoutubeUrlInput] = useState('');
  const [customYoutubeEmbed, setCustomYoutubeEmbed] = useState<string | null>(null);
  const [youtubeInputError, setYoutubeInputError] = useState<string | null>(null);

  // Cloud Gemini Omni Video state
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [cloudVideoUrl, setCloudVideoUrl] = useState<string | null>(null);
  const [cloudVideoNote, setCloudVideoNote] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastSpokenStepRef = useRef<number>(-1);
  const pollTimerRef = useRef<number | null>(null);

  // 60fps imperative animation refs (avoids 60Hz React re-renders)
  const elapsedRef = useRef<number>(0);
  const lastUiSyncMsRef = useRef<number>(0);
  const lastRenderedPoseRef = useRef<AthletePoseFrame>(
    computeAthletePoseFrame(exercise.poseType, 0)
  );
  const transitionRef = useRef<{
    active: boolean;
    startTime: number;
    fromPose: AthletePoseFrame;
  }>({
    active: false,
    startTime: 0,
    fromPose: lastRenderedPoseRef.current,
  });

  useEffect(() => {
    setVoiceGender(defaultVoiceGender);
  }, [defaultVoiceGender]);

  const steps = exercise.steps.length > 0 ? exercise.steps : [exercise.guideCaption];
  const totalDurationSec = steps.length * STEP_DURATION_SEC;

  const activeStepIndex = useMemo(() => {
    const idx = Math.floor(elapsedSec / STEP_DURATION_SEC);
    return Math.min(steps.length - 1, Math.max(0, idx));
  }, [elapsedSec, steps.length]);

  useEffect(() => {
    onActiveStepChange?.(activeStepIndex);
  }, [activeStepIndex, onActiveStepChange]);

  const triggerSmoothPoseTransition = useCallback(() => {
    transitionRef.current = {
      active: true,
      startTime: performance.now(),
      fromPose: lastRenderedPoseRef.current,
    };
    setTransitionActive(true);
  }, []);

  // Allow HomeFitnessView step cards to jump player directly to a chosen step
  useEffect(() => {
    if (!externalStepJump) return;
    const clamped = Math.max(0, Math.min(steps.length - 1, externalStepJump.index));
    if (visualMode === 'youtube') {
      setVisualMode('studio_3d');
    }
    const targetSec = clamped * STEP_DURATION_SEC;
    triggerSmoothPoseTransition();
    elapsedRef.current = targetSec;
    setElapsedSec(targetSec);
    lastSpokenStepRef.current = -1;
  }, [externalStepJump, steps.length, triggerSmoothPoseTransition, visualMode]);

  // Allow quick switching to YouTube tutorial or Photo directly from HomeFitnessView
  useEffect(() => {
    if (!externalVisualModeRequest) return;
    if (externalVisualModeRequest.mode === 'youtube') {
      setPlaying(false);
      stopActiveAiVoice();
    }
    setVisualMode(externalVisualModeRequest.mode);
  }, [externalVisualModeRequest]);

  const breathCycle = useMemo(
    () => exercise.breathCycleSec || { inhale: 4, hold: 1, exhale: 4 },
    [exercise.breathCycleSec]
  );

  const computeBreathPhase = useCallback(
    (sec: number) => {
      const breathTotal = Math.max(4, breathCycle.inhale + breathCycle.hold + breathCycle.exhale);
      const breathPos = sec % breathTotal;
      if (breathPos < breathCycle.inhale) {
        return { label: 'Hít vào', progress: breathPos / breathCycle.inhale, tone: '#ff6b1a' };
      }
      if (breathPos < breathCycle.inhale + breathCycle.hold) {
        return { label: 'Giữ hơi', progress: 1, tone: '#f59e0b' };
      }
      return {
        label: 'Thở ra',
        progress:
          1 -
          (breathPos - breathCycle.inhale - breathCycle.hold) / Math.max(1, breathCycle.exhale),
        tone: '#38bdf8',
      };
    },
    [breathCycle]
  );

  const equipmentProp = useMemo(() => getExerciseEquipmentProp(exercise), [exercise]);
  const equipmentLabelVi = useMemo(() => getEquipmentPropLabelVi(equipmentProp), [equipmentProp]);

  const breathPhase = computeBreathPhase(elapsedSec);
  const activePoseFrame = useMemo(
    () => computeAthletePoseFrame(exercise.poseType, elapsedSec * speed, activeStepIndex),
    [exercise.poseType, elapsedSec, speed, activeStepIndex]
  );

  // Draw one frame (kinematic silhouette or photo HUD overlay + Sport Amber telemetry)
  const drawFrameToCanvas = useCallback(
    (poseFrame: AthletePoseFrame, sec: number, isPlayingNow: boolean) => {
      if (visualMode !== 'kinematic' && visualMode !== 'photo') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (visualMode === 'kinematic') {
        renderVolumetricAthleteCanvas(ctx, w, h, poseFrame, isPlayingNow, equipmentProp);
      }

      lastRenderedPoseRef.current = poseFrame;

      // Sport-Tech Obsidian & Amber Alignment Brackets
      ctx.strokeStyle = 'rgba(255, 107, 26, 0.52)';
      ctx.lineWidth = 1.5;
      const pad = 16;
      const corner = 18;
      ctx.beginPath();
      ctx.moveTo(pad, pad + corner);
      ctx.lineTo(pad, pad);
      ctx.lineTo(pad + corner, pad);
      ctx.moveTo(w - pad - corner, pad);
      ctx.lineTo(w - pad, pad);
      ctx.lineTo(w - pad, pad + corner);
      ctx.stroke();

      // Top-right Breathing Cadence Ring
      const phase = computeBreathPhase(sec);
      const ringX = w - 54;
      const ringY = 52;
      const radius = 24;
      ctx.beginPath();
      ctx.arc(ringX, ringY, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 11, 14, 0.82)';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(161, 161, 170, 0.24)';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(
        ringX,
        ringY,
        radius,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.max(0.08, phase.progress)
      );
      ctx.strokeStyle = phase.tone;
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.fillStyle = '#fafafa';
      ctx.font = '600 9.5px "DM Sans", Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(phase.label, ringX, ringY);
    },
    [computeBreathPhase, visualMode]
  );

  // Reset player cleanly & cross-fade athlete pose when exercise changes
  useEffect(() => {
    setPlaying(false);
    elapsedRef.current = 0;
    setElapsedSec(0);
    setImgBroken(false);
    setCloudVideoNote(null);
    setCustomYoutubeEmbed(null);
    setCustomYoutubeUrlInput('');
    setYoutubeInputError(null);
    setCloudVideoUrl((prev) => {
      if (prev && prev.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    if (visualMode === 'ai_cloud') setVisualMode('kinematic');
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    lastSpokenStepRef.current = -1;
    stopActiveAiVoice();
    triggerSmoothPoseTransition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
      }
      stopActiveAiVoice();
    };
  }, []);

  // Draw static/paused frame whenever relevant visual properties change outside active rAF
  useEffect(() => {
    if (playing || transitionActive) return;
    if (visualMode !== 'kinematic' && visualMode !== 'photo') return;
    const pose = computeAthletePoseFrame(exercise.poseType, elapsedRef.current * speed, activeStepIndex);
    drawFrameToCanvas(pose, elapsedRef.current, false);
  }, [drawFrameToCanvas, exercise.poseType, playing, speed, transitionActive, visualMode, elapsedSec, activeStepIndex]);

  // True 60fps clock & 2D loop running while playing OR during 320ms step/exercise transition
  useEffect(() => {
    if (visualMode === 'youtube' || visualMode === 'ai_cloud') return;
    if (!playing && !transitionActive) return;

    let rafId = 0;
    let lastTs = performance.now();

    const stepLoop = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - lastTs) / 1000));
      lastTs = now;

      if (playing) {
        const nextSec = elapsedRef.current + dt * speed;
        elapsedRef.current = nextSec >= totalDurationSec ? 0 : nextSec;
      }

      if (visualMode === 'kinematic' || visualMode === 'photo') {
        const targetPose = computeAthletePoseFrame(
          exercise.poseType,
          elapsedRef.current * speed,
          activeStepIndex
        );
        let renderPose = targetPose;

        if (transitionRef.current.active) {
          const alpha = Math.min(1, (now - transitionRef.current.startTime) / TRANSITION_DURATION_MS);
          renderPose = blendAthletePoseFrames(transitionRef.current.fromPose, targetPose, alpha);
          if (alpha >= 1) {
            transitionRef.current.active = false;
            setTransitionActive(false);
          }
        }

        drawFrameToCanvas(renderPose, elapsedRef.current, playing);
      } else if (transitionRef.current.active) {
        const alpha = Math.min(1, (now - transitionRef.current.startTime) / TRANSITION_DURATION_MS);
        if (alpha >= 1) {
          transitionRef.current.active = false;
          setTransitionActive(false);
        }
      }

      if (playing && now - lastUiSyncMsRef.current >= 90) {
        lastUiSyncMsRef.current = now;
        setElapsedSec(elapsedRef.current);
      }

      if (playing || transitionRef.current.active) {
        rafId = window.requestAnimationFrame(stepLoop);
      }
    };

    rafId = window.requestAnimationFrame(stepLoop);
    return () => window.cancelAnimationFrame(rafId);
  }, [
    activeStepIndex,
    drawFrameToCanvas,
    exercise.poseType,
    playing,
    speed,
    totalDurationSec,
    transitionActive,
    visualMode,
  ]);

  // Synchronized Male/Female AI Coach Voice reading current step
  useEffect(() => {
    if (!playing || !voiceCoach || visualMode === 'youtube') return;
    if (lastSpokenStepRef.current === activeStepIndex) return;
    lastSpokenStepRef.current = activeStepIndex;

    const countryVoice = getCountryVoiceProfile(coachLangCode);
    const spokenLine =
      coachLangCode === 'vi'
        ? `Bước ${activeStepIndex + 1}: ${steps[activeStepIndex]}`
        : activeStepIndex === 0
          ? `${exercise.nameEn}. ${countryVoice.fitnessCueSample}`
          : countryVoice.fitnessCueSample;

    void speakWithAiVoice({
      text: spokenLine,
      languageCode: countryVoice.languageCode,
      bcp47: countryVoice.bcp47,
      gender: voiceGender,
      rate: speed === 1.25 ? 1.08 : speed === 0.75 ? 0.85 : 0.96,
      styleContext: 'fitness',
      vietnameseRegion,
    });
  }, [
    playing,
    voiceCoach,
    visualMode,
    activeStepIndex,
    steps,
    speed,
    voiceGender,
    coachLangCode,
    vietnameseRegion,
    exercise.nameEn,
  ]);

  const handleGenerateCloudAiVideo = async () => {
    setGeneratingVideo(true);
    setCloudVideoNote('Đang gửi yêu cầu tạo video chuyển động tới Gemini Omni (Veo)...');
    try {
      const resp = await fetch('/api/fitness/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseName: exercise.name,
          exerciseNameEn: exercise.nameEn,
          guideCaption: exercise.guideCaption,
          guideImage: exercise.guideImage,
        }),
      });
      const json = (await resp.json()) as {
        status?: string;
        interactionId?: string;
        videoBase64?: string;
        mimeType?: string;
        error?: string;
      };

      if (!resp.ok) {
        setCloudVideoNote(
          json.error || 'Chưa tạo được video AI Cloud; sử dụng Video Chuyển động AI Real-time bên dưới.'
        );
        setGeneratingVideo(false);
        return;
      }

      if (json.status === 'completed' && json.videoBase64) {
        setCloudVideoUrl(`data:${json.mimeType || 'video/mp4'};base64,${json.videoBase64}`);
        setVisualMode('ai_cloud');
        setCloudVideoNote('Đã tạo xong Video AI chuyển động thực (gemini-omni-1.2-flash).');
        setGeneratingVideo(false);
        return;
      }

      if (json.interactionId) {
        setCloudVideoNote('Gemini Omni đang dựng từng khung hình chuyển động (khoảng 20–45 giây)...');
        let attempts = 0;
        pollTimerRef.current = window.setInterval(async () => {
          attempts += 1;
          try {
            const pollResp = await fetch(
              `/api/fitness/video-status/${encodeURIComponent(json.interactionId!)}`
            );
            const pollJson = (await pollResp.json()) as {
              status?: string;
              videoBase64?: string;
              mimeType?: string;
            };
            if (pollJson.status === 'completed' && pollJson.videoBase64) {
              if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              setCloudVideoUrl(
                `data:${pollJson.mimeType || 'video/mp4'};base64,${pollJson.videoBase64}`
              );
              setVisualMode('ai_cloud');
              setCloudVideoNote('Video AI chuyển động đã sẵn sàng.');
              setGeneratingVideo(false);
            } else if (pollJson.status === 'failed' || attempts >= 24) {
              if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
              setCloudVideoNote(
                'Quá thời gian dựng video Cloud. Bạn tiếp tục dùng Video Chuyển động AI Real-time nhé.'
              );
              setGeneratingVideo(false);
            }
          } catch {
            // wait next tick
          }
        }, 4000);
      } else {
        setGeneratingVideo(false);
      }
    } catch {
      setCloudVideoNote('Không thể kết nối máy chủ tạo video AI; đang dùng Video Chuyển động AI Real-time.');
      setGeneratingVideo(false);
    }
  };

  const applyCustomYoutubeUrl = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseYouTubeEmbedUrl(customYoutubeUrlInput);
    if (!parsed) {
      setYoutubeInputError(
        'Link YouTube chưa hợp lệ. Hãy dán link watch?v=..., youtu.be/..., hoặc ID 11 ký tự.'
      );
      return;
    }
    setYoutubeInputError(null);
    setCustomYoutubeEmbed(parsed.embedUrl);
  };

  const youtubeLinks = useMemo(
    () => buildYouTubeFallbackLinks(exercise.youtubeVideoId, exercise.youtubeSearchQuery),
    [exercise.youtubeVideoId, exercise.youtubeSearchQuery]
  );

  const activeYoutubeEmbedUrl = customYoutubeEmbed || youtubeLinks.embedUrl;

  const progressPct = Math.min(100, (elapsedSec / totalDurationSec) * 100);
  const dynamicScale = playing ? 1 + breathPhase.progress * 0.04 : 1;
  const activeCountryVoice = getCountryVoiceProfile(coachLangCode);
  const activePersonaName =
    voiceGender === 'male'
      ? activeCountryVoice.male.personaName
      : activeCountryVoice.female.personaName;

  const formatSec = (sec: number) => {
    const s = Math.floor(sec);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const jumpToStep = (idx: number) => {
    const clamped = Math.max(0, Math.min(steps.length - 1, idx));
    if (visualMode === 'youtube') {
      setVisualMode('studio_3d');
    }
    triggerSmoothPoseTransition();
    const targetSec = clamped * STEP_DURATION_SEC;
    elapsedRef.current = targetSec;
    setElapsedSec(targetSec);
    lastSpokenStepRef.current = -1;
  };

  const handleScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    triggerSmoothPoseTransition();
    const targetSec = ratio * totalDurationSec;
    elapsedRef.current = targetSec;
    setElapsedSec(targetSec);
    lastSpokenStepRef.current = -1;
  };

  const previewCurrentCoachVoice = () => {
    const line =
      coachLangCode === 'vi'
        ? `Xin chào! Bắt đầu bài ${exercise.name}. ${steps[activeStepIndex]}`
        : `${exercise.nameEn}. ${activeCountryVoice.fitnessCueSample}`;
    void speakWithAiVoice({
      text: line,
      languageCode: activeCountryVoice.languageCode,
      bcp47: activeCountryVoice.bcp47,
      gender: voiceGender,
      rate: speed === 1.25 ? 1.08 : 0.96,
      styleContext: 'fitness',
      vietnameseRegion,
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800/90 bg-[#0A0B0E] shadow-xl">
      {/* Top Stage Header: Visual Mode Switch + Cloud AI Video Generator */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/90 bg-[#0D0F14] px-3 py-2">
        <div className="flex flex-wrap items-center gap-0.5 rounded-lg border border-zinc-800 bg-[#13151C] p-0.5">
          <button
            type="button"
            onClick={() => setVisualMode('studio_3d')}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              visualMode === 'studio_3d'
                ? 'bg-[#FF6B1A] text-zinc-950'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Box className="h-3 w-3 shrink-0" />
            <span>3D Dụng cụ</span>
          </button>
          <button
            type="button"
            onClick={() => setVisualMode('kinematic')}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              visualMode === 'kinematic'
                ? 'bg-[#FF6B1A] text-zinc-950'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <Film className="h-3 w-3 shrink-0" />
            <span>2D 60fps</span>
          </button>
          <button
            type="button"
            onClick={() => setVisualMode('photo')}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              visualMode === 'photo'
                ? 'bg-[#FF6B1A] text-zinc-950'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            <ImageIcon className="h-3 w-3 shrink-0" />
            <span>Ảnh chuẩn</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              stopActiveAiVoice();
              setVisualMode('youtube');
            }}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
              visualMode === 'youtube'
                ? 'bg-rose-500 text-white'
                : 'text-rose-300 hover:text-white'
            }`}
          >
            <Youtube className="h-3.5 w-3.5 shrink-0" />
            <span>YouTube</span>
          </button>
          {cloudVideoUrl && (
            <button
              type="button"
              onClick={() => setVisualMode('ai_cloud')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                visualMode === 'ai_cloud'
                  ? 'bg-amber-400 text-zinc-950'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Sparkles className="h-3 w-3 shrink-0" />
              <span>Omni MP4</span>
            </button>
          )}
        </div>

        <button
          type="button"
          disabled={generatingVideo}
          onClick={() => void handleGenerateCloudAiVideo()}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/25 disabled:opacity-60 whitespace-nowrap shrink-0"
        >
          {generatingVideo ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          <span>{generatingVideo ? 'Đang tạo...' : 'Video AI Omni'}</span>
        </button>
      </div>

      {/* True 16:9 Interactive Video Stage */}
      <div
        className={`relative w-full aspect-video overflow-hidden bg-[#07080C] ${
          expanded ? 'max-h-[540px]' : ''
        }`}
      >
        {visualMode === 'youtube' ? (
          <iframe
            key={activeYoutubeEmbedUrl}
            src={activeYoutubeEmbedUrl}
            title={`Video YouTube hướng dẫn: ${exercise.name}`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full border-0"
          />
        ) : visualMode === 'ai_cloud' && cloudVideoUrl ? (
          <video
            src={cloudVideoUrl}
            controls
            autoPlay
            loop
            playsInline
            className="h-full w-full object-cover"
          />
        ) : visualMode === 'studio_3d' ? (
          <>
            <Exercise3DStage
              exerciseId={exercise.id}
              poseType={exercise.poseType}
              equipmentProp={equipmentProp}
              breathCycleSec={exercise.breathCycleSec}
              playing={playing}
              speed={speed}
              elapsedSec={elapsedSec}
              getLiveElapsedSec={() => elapsedRef.current}
              activeStepIndex={activeStepIndex}
            />
            {!imgBroken && (
              <div className="pointer-events-none absolute right-3 top-3 w-20 sm:w-28 overflow-hidden rounded-lg border border-orange-500/45 bg-[#13151C] shadow-xl">
                <img
                  src={exercise.guideImage}
                  alt={`Tư thế mẫu ${exercise.name}`}
                  referrerPolicy="no-referrer"
                  onError={() => setImgBroken(true)}
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="bg-[#0A0B0E]/90 px-1.5 py-0.5 text-[9px] font-medium text-orange-300 truncate">
                  Ảnh tư thế chuẩn
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {visualMode === 'photo' && !imgBroken && (
              <img
                src={exercise.guideImage}
                alt={`Ảnh động tác ${exercise.name}`}
                referrerPolicy="no-referrer"
                onError={() => setImgBroken(true)}
                style={{ transform: `scale(${dynamicScale.toFixed(4)})` }}
                className="h-full w-full object-cover transition-transform duration-300 ease-out"
              />
            )}

            {/* Real-Time 60fps Volumetric Kinematic Athlete Canvas OR HUD overlay on photo */}
            <canvas
              ref={canvasRef}
              width={640}
              height={360}
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            />

            {/* Real Reference Workout Photo Corner Picture-in-Picture */}
            {visualMode === 'kinematic' && !imgBroken && (
              <div className="absolute bottom-3 right-3 w-24 sm:w-32 overflow-hidden rounded-lg border border-orange-500/45 bg-[#13151C] shadow-xl">
                <img
                  src={exercise.guideImage}
                  alt={`Tư thế mẫu ${exercise.name}`}
                  referrerPolicy="no-referrer"
                  onError={() => setImgBroken(true)}
                  className="aspect-[16/10] w-full object-cover"
                />
                <div className="bg-[#0A0B0E]/90 px-1.5 py-0.5 text-[9px] font-medium text-orange-300 truncate">
                  Ảnh tư thế chuẩn
                </div>
              </div>
            )}
          </>
        )}

        {/* Top Left Live Coach Status */}
        {visualMode !== 'youtube' && (
          <div className="pointer-events-none absolute left-3.5 top-3 flex flex-wrap items-center gap-2 pr-28">
            <span className="inline-flex items-center gap-1.5 rounded-md border border-orange-500/40 bg-[#0A0B0E]/90 px-2.5 py-1 text-[11px] font-semibold text-orange-300 tabular-nums">
              <Wind className="h-3 w-3 shrink-0" />
              <span>
                {playing ? (visualMode === 'studio_3d' ? 'Đang chạy 3D 60fps' : 'Đang mô phỏng 60fps') : 'Sẵn sàng phát'} · Bước{' '}
                {String(activeStepIndex + 1).padStart(2, '0')}/{String(steps.length).padStart(2, '0')}
              </span>
            </span>
            {visualMode === 'kinematic' && (
              <span className="hidden sm:inline-flex rounded-md border border-zinc-700/80 bg-[#0A0B0E]/90 px-2 py-1 text-[11px] text-zinc-200">
                {activePoseFrame.poseLabel}
              </span>
            )}
          </div>
        )}

        {/* Unobtrusive Play Trigger when Paused */}
        {!playing && visualMode !== 'ai_cloud' && visualMode !== 'youtube' && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label="Phát video chuyển động hướng dẫn"
            className={`absolute left-3.5 items-center gap-2 rounded-lg border border-orange-300/60 bg-[#FF6B1A] px-3 py-1.5 text-xs font-bold text-zinc-950 shadow-xl transition-transform hover:scale-[1.03] hover:bg-[#ff7f38] ${
              visualMode === 'studio_3d' ? 'hidden sm:inline-flex top-11' : 'inline-flex bottom-3'
            }`}
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>Phát Chuyển động</span>
          </button>
        )}
      </div>

      {/* Dedicated Unclipped Synchronized Step Subtitle Bar Below Stage */}
      {visualMode !== 'ai_cloud' && visualMode !== 'youtube' && (
        <div className="border-t border-zinc-800/90 bg-[#0D0F14] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-400 tabular-nums">
              Kỹ thuật Bước {String(activeStepIndex + 1).padStart(2, '0')} · {exercise.repsOrHold}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-400 tabular-nums">
              <span>
                {equipmentLabelVi} · {activePoseFrame.poseLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  stopActiveAiVoice();
                  setVisualMode('youtube');
                }}
                className="inline-flex items-center gap-1 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/20 whitespace-nowrap"
              >
                <Youtube className="h-3 w-3 shrink-0" />
                <span>Chưa hiểu? Xem YouTube</span>
              </button>
            </div>
          </div>
          <p className="mt-1 text-xs sm:text-sm font-medium leading-relaxed text-zinc-100">
            {steps[activeStepIndex]}
          </p>
        </div>
      )}

      {/* Inline YouTube Tutorial Info, Direct Fallback Links & Custom Link Bar */}
      {visualMode === 'youtube' && (
        <div className="space-y-2.5 border-t border-rose-500/30 bg-[#0D0F14] px-4 py-3 text-xs text-zinc-200">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-rose-300 truncate">{exercise.youtubeTitle}</div>
              <div className="mt-0.5 text-[11px] text-zinc-400">
                Kênh gợi ý: {exercise.youtubeChannel} · Từ khóa tham khảo: &ldquo;
                {exercise.youtubeSearchQuery}&rdquo;
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <a
                href={youtubeLinks.watchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/25 whitespace-nowrap"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span>Mở trên YouTube</span>
              </a>
              <a
                href={youtubeLinks.searchUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-[#13151C] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800 whitespace-nowrap"
              >
                <Search className="h-3 w-3 shrink-0" />
                <span>Tìm thêm video</span>
              </a>
              {customYoutubeEmbed && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomYoutubeEmbed(null);
                    setCustomYoutubeUrlInput('');
                    setYoutubeInputError(null);
                  }}
                  className="rounded-md border border-zinc-700 bg-[#13151C] px-2.5 py-1 text-[11px] font-medium text-zinc-200 hover:bg-zinc-800 whitespace-nowrap"
                >
                  Về video mẫu bài tập
                </button>
              )}
              <button
                type="button"
                onClick={() => setVisualMode('studio_3d')}
                className="inline-flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-300 hover:bg-orange-500/20 whitespace-nowrap"
              >
                <Box className="h-3 w-3 shrink-0" />
                <span>Về mô hình 3D</span>
              </button>
            </div>
          </div>

          <form onSubmit={applyCustomYoutubeUrl} className="flex flex-wrap items-center gap-2">
            <label className="relative flex-1 min-w-[200px]">
              <Link2 className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={customYoutubeUrlInput}
                onChange={(e) => {
                  setCustomYoutubeUrlInput(e.target.value);
                  if (youtubeInputError) setYoutubeInputError(null);
                }}
                placeholder="Dán link YouTube hướng dẫn khác nếu muốn xem thêm (watch?v=... / youtu.be/...)"
                className="w-full rounded-lg border border-zinc-700 bg-[#13151C] py-1.5 pl-8 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-rose-400 focus:outline-none"
              />
            </label>
            <button
              type="submit"
              className="inline-flex items-center gap-1 rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400 whitespace-nowrap shrink-0"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Phát YouTube này</span>
            </button>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="rounded-lg border border-zinc-700 px-2.5 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 whitespace-nowrap shrink-0"
            >
              {expanded ? 'Thu gọn khung' : 'Phóng to khung'}
            </button>
          </form>

          {youtubeInputError && <p className="text-[11px] text-amber-300">{youtubeInputError}</p>}
        </div>
      )}

      {cloudVideoNote && (
        <div className="border-t border-amber-500/30 bg-amber-950/40 px-4 py-2 text-xs text-amber-200">
          {cloudVideoNote}
        </div>
      )}

      {/* Video Player Controls Bar */}
      <div className="space-y-2.5 border-t border-zinc-800/90 bg-[#0A0B0E] px-4 py-3 text-zinc-200">
        {/* Clickable Scrubber */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Thanh tua tiến trình video hướng dẫn"
          aria-valuemin={0}
          aria-valuemax={totalDurationSec}
          aria-valuenow={Math.round(elapsedSec)}
          onClick={handleScrub}
          className="relative h-2 w-full cursor-pointer overflow-hidden rounded-full bg-zinc-800"
        >
          <div
            className="h-full bg-gradient-to-r from-[#FF6B1A] to-amber-400 transition-all duration-75"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Step Quick-Jump Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {steps.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => jumpToStep(idx)}
              className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums transition-colors ${
                idx === activeStepIndex && visualMode !== 'youtube'
                  ? 'bg-[#FF6B1A] text-zinc-950'
                  : 'bg-[#13151C] text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              Bước {String(idx + 1).padStart(2, '0')}
            </button>
          ))}
        </div>

        {/* Transport + Speed Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                if (visualMode === 'youtube') setVisualMode('studio_3d');
                setPlaying((p) => !p);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF6B1A] px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-[#ff7f38] whitespace-nowrap"
            >
              {playing && visualMode !== 'youtube' ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span>{playing && visualMode !== 'youtube' ? 'Tạm dừng' : 'Phát Chuyển động'}</span>
            </button>
            <button
              type="button"
              onClick={() => jumpToStep(activeStepIndex - 1)}
              aria-label="Bước trước"
              className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => jumpToStep(activeStepIndex + 1)}
              aria-label="Bước tiếp theo"
              className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPlaying(false);
                triggerSmoothPoseTransition();
                elapsedRef.current = 0;
                setElapsedSec(0);
              }}
              aria-label="Phát lại từ đầu"
              className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <span className="ml-1 font-mono text-xs text-zinc-400 tabular-nums">
              {formatSec(elapsedSec)} / {formatSec(totalDurationSec)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSpeed((s) => (s === 1 ? 1.25 : s === 1.25 ? 0.75 : 1))}
              className="rounded-lg border border-zinc-700 px-2 py-1.5 font-mono text-xs font-semibold text-zinc-200 hover:bg-zinc-800 tabular-nums"
            >
              {speed}x
            </button>

            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              aria-label={expanded ? 'Thu gọn khung video' : 'Mở rộng khung video'}
              className="rounded-lg border border-zinc-700 p-1.5 text-zinc-300 hover:bg-zinc-800"
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Multilingual Male / Female AI Coach Voice Controls Strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-[#13151C] px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !voiceCoach;
                setVoiceCoach(next);
                if (!next) stopActiveAiVoice();
              }}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                voiceCoach
                  ? 'border-orange-500/60 bg-orange-500/20 text-orange-200'
                  : 'border-zinc-700 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              {voiceCoach ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              <span>HLV đọc AI</span>
            </button>

            {/* Gender Switch: Nữ / Nam */}
            <div className="inline-flex rounded-md border border-zinc-700 bg-[#0A0B0E] p-0.5">
              <button
                type="button"
                onClick={() => {
                  setVoiceGender('female');
                  onChangeVoiceGender?.('female');
                }}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  voiceGender === 'female'
                    ? 'bg-pink-500 text-zinc-950'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                Giọng Nữ
              </button>
              <button
                type="button"
                onClick={() => {
                  setVoiceGender('male');
                  onChangeVoiceGender?.('male');
                }}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  voiceGender === 'male'
                    ? 'bg-sky-400 text-zinc-950'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                Giọng Nam
              </button>
            </div>

            <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400">
              <Globe2 className="h-3.5 w-3.5 text-orange-400 shrink-0" />
              <select
                aria-label="Chọn quốc gia giọng đọc huấn luyện viên AI"
                value={coachLangCode}
                onChange={(e) => setCoachLangCode(e.target.value)}
                className="rounded border border-zinc-700 bg-[#0A0B0E] px-2 py-1 text-[11px] font-medium text-zinc-100"
              >
                {AI_COUNTRY_VOICES.map((v) => (
                  <option key={v.languageCode} value={v.languageCode}>
                    {v.countryVi} ({v.flagTag})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={previewCurrentCoachVoice}
            className="inline-flex items-center gap-1 rounded-md border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-[11px] font-semibold text-orange-200 hover:bg-orange-500/20 whitespace-nowrap"
          >
            <Volume2 className="h-3 w-3" />
            <span>Thử {activePersonaName.split('(')[0].trim()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
