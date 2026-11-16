import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Award,
  Brain,
  Calculator,
  Compass,
  Flame,
  Gamepad2,
  Music,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { VOCAB_FLASHCARDS } from '../data/languages';
import type { GameProgressionState } from '../types/lifeworld';
import {
  computeLevelFromXp,
  createMemoryDeck,
  evaluateRhythmHit,
  generateLogicChallenge,
  generateMathChallenge,
  generateRhythmChart,
  generateStroopRound,
  RHYTHM_LANES,
  type MemoryCard,
  type RhythmCue,
  type StroopColorDef,
} from '../utils/gameEngine';
import { soundEngine } from '../utils/soundEngine';
import { EnglishTopicArena } from './EnglishTopicArena';
import { World3DExplorer } from './World3DExplorer';
import type { CefrLevel, VoiceGender } from '../types/lifeworld';

interface GameWorldViewProps {
  displayName: string;
  streakDays: number;
  game: GameProgressionState;
  userLevel?: CefrLevel;
  fitnessGoal?: string;
  workoutsCount?: number;
  aiConfigured?: boolean;
  claudeConfigured?: boolean;
  aiVoiceGender?: VoiceGender;
  onAddXp: (amount: number, badge?: string) => void;
  onUpdateHighScore: (patch: Partial<GameProgressionState['highScores']>) => void;
  onUpdateAvatar: (patch: Partial<GameProgressionState['avatarStyle']>) => void;
  onLaunchKidGame: () => void;
  onNavigateToLanguages?: () => void;
}

type MiniGameId =
  | 'english_arena'
  | 'rhythm'
  | 'stroop'
  | '3d_world'
  | 'memory'
  | 'reflex'
  | 'math'
  | 'logic'
  | 'vocab';

interface LeaderboardRow {
  id: string;
  name: string;
  xp: number;
  level: number;
  streakDays: number;
}

const RHYTHM_DURATION_MS = 22000;
const RHYTHM_LOOKAHEAD_MS = 1900;
const STROOP_ROUND_SEC = 25;

export const GameWorldView: React.FC<GameWorldViewProps> = ({
  displayName,
  streakDays,
  game,
  userLevel = 'B1',
  fitnessGoal = 'maintain',
  workoutsCount = 0,
  aiConfigured = false,
  claudeConfigured = false,
  aiVoiceGender = 'female',
  onAddXp,
  onUpdateHighScore,
  onUpdateAvatar,
  onLaunchKidGame,
  onNavigateToLanguages,
}) => {
  const [activeGame, setActiveGame] = useState<MiniGameId>('english_arena');

  // ================= 1. RHYTHM BEAT CHALLENGE (NEW) =================
  const [rhythmBpm, setRhythmBpm] = useState<95 | 120 | 140>(120);
  const [rhythmState, setRhythmState] = useState<'idle' | 'playing' | 'summary'>('idle');
  const [rhythmElapsedMs, setRhythmElapsedMs] = useState(0);
  const [rhythmCues, setRhythmCues] = useState<RhythmCue[]>([]);
  const [rhythmScore, setRhythmScore] = useState(0);
  const [rhythmCombo, setRhythmCombo] = useState(0);
  const [rhythmMaxCombo, setRhythmMaxCombo] = useState(0);
  const [rhythmJudgment, setRhythmJudgment] = useState<string | null>(null);
  const [flashLane, setFlashLane] = useState<number | null>(null);

  const rhythmStartTsRef = useRef(0);
  const rhythmCuesRef = useRef<RhythmCue[]>([]);
  const rhythmScoreRef = useRef(0);
  const rhythmComboRef = useRef(0);
  const rhythmMaxComboRef = useRef(0);

  // ================= 2. STROOP COGNITIVE ARENA (NEW) =================
  const [stroopPhase, setStroopPhase] = useState<'idle' | 'playing' | 'done'>('idle');
  const [stroopRoundIdx, setStroopRoundIdx] = useState(0);
  const [stroopRound, setStroopRound] = useState(() => generateStroopRound(0, 0.23));
  const [stroopScore, setStroopScore] = useState(0);
  const [stroopStreak, setStroopStreak] = useState(0);
  const [stroopTimeLeft, setStroopTimeLeft] = useState(STROOP_ROUND_SEC);
  const [stroopFeedback, setStroopFeedback] = useState<string | null>(null);

  // ================= 3. EXISTING CLASSIC GAMES =================
  const [cards, setCards] = useState<MemoryCard[]>(() => createMemoryDeck());
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [memoryWon, setMemoryWon] = useState(false);

  const [reflexPhase, setReflexPhase] = useState<'idle' | 'waiting' | 'ready' | 'done'>('idle');
  const [reflexStartTime, setReflexStartTime] = useState(0);
  const [reflexMs, setReflexMs] = useState<number | null>(null);

  const [mathChallenge, setMathChallenge] = useState(() => generateMathChallenge(2));
  const [mathStreak, setMathStreak] = useState(0);
  const [mathFeedback, setMathFeedback] = useState<string | null>(null);

  const [logicIdx, setLogicIdx] = useState(0);
  const [logicFeedback, setLogicFeedback] = useState<string | null>(null);

  const [vocabIdx, setVocabIdx] = useState(0);
  const [vocabFeedback, setVocabFeedback] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [lbMessage, setLbMessage] = useState<string | null>(null);

  const levelInfo = computeLevelFromXp(game.xp);

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.entries)) setLeaderboard(d.entries);
      })
      .catch(() => {});
  }, []);

  // Rhythm Game Loop
  const finishRhythmRound = useCallback(() => {
    setRhythmState('summary');
    const finalScore = rhythmScoreRef.current;
    const xpEarned = Math.max(20, Math.min(120, Math.round(finalScore / 22)));
    soundEngine.playGameFeedback('win');
    onAddXp(xpEarned, finalScore >= 1400 ? 'Bậc thầy Nhịp Điệu' : undefined);
    if (finalScore > (game.highScores.rhythmBestScore ?? 0)) {
      onUpdateHighScore({ rhythmBestScore: finalScore });
    }
  }, [game.highScores.rhythmBestScore, onAddXp, onUpdateHighScore]);

  const startRhythmGame = () => {
    const chart = generateRhythmChart(rhythmBpm, RHYTHM_DURATION_MS);
    rhythmCuesRef.current = chart;
    rhythmScoreRef.current = 0;
    rhythmComboRef.current = 0;
    rhythmMaxComboRef.current = 0;
    rhythmStartTsRef.current = performance.now();
    setRhythmCues(chart);
    setRhythmScore(0);
    setRhythmCombo(0);
    setRhythmMaxCombo(0);
    setRhythmElapsedMs(0);
    setRhythmJudgment('Chuẩn bị bắt nhịp...');
    setRhythmState('playing');
  };

  const triggerRhythmLane = useCallback(
    (laneIdx: 0 | 1 | 2 | 3) => {
      if (rhythmState !== 'playing') return;
      setFlashLane(laneIdx);
      window.setTimeout(() => setFlashLane((prev) => (prev === laneIdx ? null : prev)), 130);

      const nowElapsed = performance.now() - rhythmStartTsRef.current;
      const laneFreqs = [261.63, 329.63, 392.0, 523.25];

      // Find nearest pending cue in this lane
      let bestIdx = -1;
      let bestAbs = Infinity;
      rhythmCuesRef.current.forEach((c, idx) => {
        if (c.lane === laneIdx && c.hitState === 'pending') {
          const absDiff = Math.abs(c.targetTimeMs - nowElapsed);
          if (absDiff < bestAbs) {
            bestAbs = absDiff;
            bestIdx = idx;
          }
        }
      });

      if (bestIdx === -1 || bestAbs > 260) {
        soundEngine.playTone(150, 70, 'triangle', 0.04);
        setRhythmCombo(0);
        rhythmComboRef.current = 0;
        setRhythmJudgment('Sớm/Trễ nhịp');
        return;
      }

      const cue = rhythmCuesRef.current[bestIdx];
      const delta = cue.targetTimeMs - nowElapsed;
      const evalRes = evaluateRhythmHit(delta);
      if (evalRes.grade === 'miss') {
        cue.hitState = 'miss';
        rhythmComboRef.current = 0;
        setRhythmCombo(0);
        setRhythmJudgment('Trượt!');
        soundEngine.playGameFeedback('error');
      } else {
        cue.hitState = evalRes.grade;
        const nextCombo = rhythmComboRef.current + 1;
        rhythmComboRef.current = nextCombo;
        rhythmMaxComboRef.current = Math.max(rhythmMaxComboRef.current, nextCombo);
        const mult = nextCombo >= 12 ? 3 : nextCombo >= 6 ? 2 : 1;
        rhythmScoreRef.current += evalRes.points * mult;
        setRhythmScore(rhythmScoreRef.current);
        setRhythmCombo(nextCombo);
        setRhythmMaxCombo(rhythmMaxComboRef.current);
        setRhythmJudgment(
          evalRes.grade === 'perfect'
            ? `HOÀN HẢO! +${evalRes.points * mult}`
            : `TỐT +${evalRes.points * mult}`
        );
        soundEngine.playTone(laneFreqs[laneIdx], 110, 'sine', 0.08);
      }
      setRhythmCues([...rhythmCuesRef.current]);
    },
    [rhythmState]
  );

  useEffect(() => {
    if (rhythmState !== 'playing' || activeGame !== 'rhythm') return;
    let rafId = 0;

    const tick = () => {
      const elapsed = performance.now() - rhythmStartTsRef.current;
      let changed = false;
      for (const cue of rhythmCuesRef.current) {
        if (cue.hitState === 'pending' && elapsed - cue.targetTimeMs > 235) {
          cue.hitState = 'miss';
          rhythmComboRef.current = 0;
          setRhythmCombo(0);
          setRhythmJudgment('Bỏ lỡ nhịp');
          changed = true;
        }
      }
      if (changed) {
        setRhythmCues([...rhythmCuesRef.current]);
      }
      setRhythmElapsedMs(elapsed);

      if (elapsed >= RHYTHM_DURATION_MS) {
        finishRhythmRound();
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      if (code === 'KeyD') triggerRhythmLane(0);
      else if (code === 'KeyF') triggerRhythmLane(1);
      else if (code === 'KeyJ') triggerRhythmLane(2);
      else if (code === 'KeyK') triggerRhythmLane(3);
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [activeGame, finishRhythmRound, rhythmState, triggerRhythmLane]);

  // Stroop Arena Timer
  const startStroopArena = () => {
    setStroopScore(0);
    setStroopStreak(0);
    setStroopRoundIdx(0);
    setStroopRound(generateStroopRound(0));
    setStroopTimeLeft(STROOP_ROUND_SEC);
    setStroopFeedback(null);
    setStroopPhase('playing');
  };

  useEffect(() => {
    if (stroopPhase !== 'playing' || activeGame !== 'stroop') return;
    if (stroopTimeLeft <= 0) {
      setStroopPhase('done');
      soundEngine.playGameFeedback('win');
      const xpEarned = Math.max(15, Math.min(90, Math.round(stroopScore / 15)));
      onAddXp(xpEarned, stroopScore >= 600 ? 'Bậc thầy Phản xạ Thị giác' : undefined);
      if (stroopScore > (game.highScores.stroopBestScore ?? 0)) {
        onUpdateHighScore({ stroopBestScore: stroopScore });
      }
      return;
    }
    const id = window.setTimeout(() => {
      setStroopTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [activeGame, game.highScores.stroopBestScore, onAddXp, onUpdateHighScore, stroopPhase, stroopScore, stroopTimeLeft]);

  const handleStroopChoice = (choice: StroopColorDef['id']) => {
    if (stroopPhase !== 'playing') return;
    if (choice === stroopRound.correctColorId) {
      const nextStreak = stroopStreak + 1;
      const pts = 40 + Math.min(60, nextStreak * 10);
      setStroopScore((s) => s + pts);
      setStroopStreak(nextStreak);
      setStroopFeedback(`Chính xác! +${pts} điểm (Chuỗi ${nextStreak})`);
      soundEngine.playGameFeedback('match');
    } else {
      setStroopStreak(0);
      setStroopFeedback('Nhầm rồi! Tập trung đúng yêu cầu (Màu mực hay Nghĩa từ).');
      soundEngine.playGameFeedback('error');
    }
    const nextIdx = stroopRoundIdx + 1;
    setStroopRoundIdx(nextIdx);
    setStroopRound(generateStroopRound(nextIdx));
  };

  // Classic Games Handlers
  const handleFlipCard = (idx: number) => {
    if (memoryWon) return;
    const card = cards[idx];
    if (card.flipped || card.matched || selectedIndices.length >= 2) return;

    const nextCards = cards.map((c, i) => (i === idx ? { ...c, flipped: true } : c));
    const nextSelected = [...selectedIndices, idx];
    setCards(nextCards);
    setSelectedIndices(nextSelected);

    if (nextSelected.length === 2) {
      const [firstIdx, secondIdx] = nextSelected;
      const nextMoves = memoryMoves + 1;
      setMemoryMoves(nextMoves);

      if (nextCards[firstIdx].pairId === nextCards[secondIdx].pairId) {
        soundEngine.playGameFeedback('match');
        const matchedDeck = nextCards.map((c, i) =>
          i === firstIdx || i === secondIdx ? { ...c, matched: true } : c
        );
        setCards(matchedDeck);
        setSelectedIndices([]);
        if (matchedDeck.every((c) => c.matched)) {
          setMemoryWon(true);
          soundEngine.playGameFeedback('win');
          onAddXp(40, 'Bậc thầy Trí nhớ');
          if (!game.highScores.memoryMovesBest || nextMoves < game.highScores.memoryMovesBest) {
            onUpdateHighScore({ memoryMovesBest: nextMoves });
          }
        }
      } else {
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c, i) =>
              i === firstIdx || i === secondIdx ? { ...c, flipped: false } : c
            )
          );
          setSelectedIndices([]);
        }, 650);
      }
    }
  };

  const resetMemory = () => {
    setCards(createMemoryDeck());
    setSelectedIndices([]);
    setMemoryMoves(0);
    setMemoryWon(false);
  };

  useEffect(() => {
    if (reflexPhase !== 'waiting' || activeGame !== 'reflex') return;
    const delay = 1100 + Math.floor(Math.random() * 1900);
    const id = window.setTimeout(() => {
      setReflexStartTime(performance.now());
      setReflexPhase('ready');
    }, delay);
    return () => window.clearTimeout(id);
  }, [activeGame, reflexPhase]);

  const startReflexTest = () => {
    setReflexMs(null);
    setReflexPhase('waiting');
  };

  const handleReflexClick = () => {
    if (reflexPhase === 'waiting') {
      setReflexPhase('idle');
      soundEngine.playGameFeedback('error');
      setReflexMs(-1);
    } else if (reflexPhase === 'ready') {
      const elapsed = Math.round(performance.now() - reflexStartTime);
      setReflexMs(elapsed);
      setReflexPhase('done');
      soundEngine.playGameFeedback('win');
      onAddXp(25, elapsed < 260 ? 'Phản xạ Tia chớp' : undefined);
      if (!game.highScores.reflexMsBest || elapsed < game.highScores.reflexMsBest) {
        onUpdateHighScore({ reflexMsBest: elapsed });
      }
    }
  };

  const handleMathAnswer = (opt: number) => {
    if (opt === mathChallenge.answer) {
      const nextStreak = mathStreak + 1;
      setMathStreak(nextStreak);
      setMathFeedback(`Chính xác! Chuỗi ${nextStreak} câu (+15 XP)`);
      soundEngine.playGameFeedback('match');
      onAddXp(15);
      if (nextStreak > game.highScores.mathStreakBest) {
        onUpdateHighScore({ mathStreakBest: nextStreak });
      }
      setMathChallenge(generateMathChallenge(nextStreak >= 5 ? 3 : 2));
    } else {
      setMathStreak(0);
      setMathFeedback(`Chưa đúng. Đáp án là ${mathChallenge.answer}.`);
      soundEngine.playGameFeedback('error');
      setMathChallenge(generateMathChallenge(1));
    }
  };

  const currentLogic = generateLogicChallenge(logicIdx);
  const handleLogicAnswer = (opt: number) => {
    if (opt === currentLogic.answer) {
      setLogicFeedback(`Chính xác! ${currentLogic.explanation} (+25 XP)`);
      soundEngine.playGameFeedback('win');
      onAddXp(25, 'Nhà Tư duy Logic');
      onUpdateHighScore({ logicSolved: game.highScores.logicSolved + 1 });
    } else {
      setLogicFeedback('Chưa khớp quy luật. Hãy thử phân tích hiệu số giữa các số.');
      soundEngine.playGameFeedback('error');
    }
  };

  const vocabTarget = VOCAB_FLASHCARDS[vocabIdx % VOCAB_FLASHCARDS.length];
  const vocabDistractors = VOCAB_FLASHCARDS.filter((v) => v.id !== vocabTarget.id)
    .slice(0, 3)
    .map((v) => v.meaningVi);
  const vocabOptions = [vocabTarget.meaningVi, ...vocabDistractors].sort();

  const handleSubmitLeaderboard = async () => {
    try {
      const resp = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: displayName,
          xp: game.xp,
          level: levelInfo.level,
          streakDays,
        }),
      });
      const json = await resp.json();
      if (Array.isArray(json.entries)) {
        setLeaderboard(json.entries);
        setLbMessage('Đã cập nhật điểm của bạn lên Bảng xếp hạng tùy chọn.');
      }
    } catch {
      setLbMessage('Không thể đồng bộ bảng xếp hạng lúc này.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Featured Game Kid Arcade Banner */}
      <section className="relative overflow-hidden rounded-xl border border-amber-400/35 bg-slate-900">
        <div className="grid grid-cols-1 items-stretch lg:grid-cols-12">
          <div className="relative z-10 flex flex-col justify-between p-6 lg:col-span-7">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Sparkles className="h-3.5 w-3.5" />
                <span>GAME KID 2D ARCADE · KỶ LỤC {game.highScores.kidArcadeBestScore} ĐIỂM</span>
              </div>
              <h2 className="mt-1.5 font-display text-2xl font-bold text-white">
                Phiêu lưu Hứng sao Học Toán & Từ vựng
              </h2>
              <p className="mt-2 max-w-xl text-sm text-slate-300">
                Bé điều khiển nhân vật {game.avatarStyle.companionName} qua trái phải để hứng đúng ngôi sao đáp án phép tính và từ vựng Tiếng Anh — đồ họa bầu trời cực quang, âm thanh vui nhộn và nhận XP nâng cấp.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onLaunchKidGame}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-2.5 text-sm font-extrabold text-slate-950 hover:bg-amber-300 transition-colors"
              >
                <Play className="h-4 w-4 fill-slate-950" />
                <span>Chơi Game Kid ngay</span>
              </button>
              <span className="font-mono text-xs text-slate-300">
                Hỗ trợ bàn phím (← → Space) & cảm ứng di động
              </span>
            </div>
          </div>
          <div className="relative min-h-[175px] lg:col-span-5">
            <img
              src="/src/assets/images/kid_star_adventure_bg_1794800546818.jpg"
              alt="Game Kid Bé Hứng Sao"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-900/35 to-transparent" />
          </div>
        </div>
      </section>

      {/* Gamification Header & Game Selector */}
      <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">
              Cấp độ {levelInfo.level} · {game.xp} XP · {game.badges.length} Huy hiệu
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              AI Game World — Nhịp điệu, Phản xạ Stroop & Công viên 3D
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <span>Màu giáp 3D:</span>
              <input
                type="color"
                value={game.avatarStyle.suitColor}
                onChange={(e) => onUpdateAvatar({ suitColor: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border border-slate-300 bg-transparent"
              />
            </label>
            <div className="w-40">
              <div className="flex justify-between text-[11px] font-mono text-slate-500 tabular-nums">
                <span>Tiến độ cấp</span>
                <span>{levelInfo.progressPct}%</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-zinc-800">
                <div
                  className="h-full bg-orange-600 dark:bg-[#FF6B1A]"
                  style={{ width: `${levelInfo.progressPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-1.5">
          {[
            { id: 'english_arena', label: 'Tiếng Anh 9 Chủ đề (Đa AI)', icon: Sparkles },
            { id: 'rhythm', label: 'Nhịp Điệu Thể Thao', icon: Music },
            { id: 'stroop', label: 'Đấu Trường Stroop', icon: Flame },
            { id: '3d_world', label: 'Công viên 3D Explorer', icon: Compass },
            { id: 'memory', label: 'Trí nhớ (Memory)', icon: Brain },
            { id: 'reflex', label: 'Phản xạ (Reflex)', icon: Zap },
            { id: 'math', label: 'Toán học Tốc độ', icon: Calculator },
            { id: 'logic', label: 'Tư duy Logic', icon: Gamepad2 },
            { id: 'vocab', label: 'Đoán Từ vựng', icon: Award },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveGame(tab.id as MiniGameId)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeGame === tab.id
                    ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Active Playable Game Area */}
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-8 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          {activeGame === 'english_arena' && (
            <EnglishTopicArena
              displayName={displayName}
              userLevel={userLevel}
              fitnessGoal={fitnessGoal}
              workoutsCount={workoutsCount}
              bestArenaScore={game.highScores.englishArenaBestScore ?? 0}
              aiConfigured={aiConfigured}
              claudeConfigured={claudeConfigured}
              aiVoiceGender={aiVoiceGender}
              onAddXp={onAddXp}
              onUpdateArenaBestScore={(score) =>
                onUpdateHighScore({ englishArenaBestScore: score })
              }
              onNavigateToLanguages={onNavigateToLanguages}
            />
          )}

          {/* NEW GAME 1: FITNESS RHYTHM BEAT */}
          {activeGame === 'rhythm' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                    Nhịp Điệu Thể Thao — 4-Lane Rhythm Beat
                  </h2>
                  <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    Kỷ lục: {game.highScores.rhythmBestScore ?? 0} điểm · Bấm phím D / F / J / K hoặc chạm nút khi nốt chạm vạch
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  {([95, 120, 140] as const).map((bpmVal) => (
                    <button
                      key={bpmVal}
                      type="button"
                      disabled={rhythmState === 'playing'}
                      onClick={() => setRhythmBpm(bpmVal)}
                      className={`rounded-md px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                        rhythmBpm === bpmVal
                          ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                          : 'border border-stone-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {bpmVal} BPM
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-[#0A0B0E] p-4 text-white">
                {/* Score & Timer Header */}
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-mono tabular-nums">
                    Điểm: <span className="font-bold text-[#FF6B1A]">{rhythmScore}</span> · Combo:{' '}
                    <span className="font-bold text-sky-400">x{rhythmCombo}</span>
                  </div>
                  <div className="font-medium text-amber-300">
                    {rhythmJudgment || 'Sẵn sàng bắt nhịp'}
                  </div>
                  <div className="font-mono text-zinc-400 tabular-nums">
                    {Math.max(0, Math.ceil((RHYTHM_DURATION_MS - rhythmElapsedMs) / 1000))}s
                  </div>
                </div>

                {/* 4-Lane Highway */}
                <div className="relative grid h-64 grid-cols-4 gap-2 overflow-hidden rounded-lg border border-zinc-800 bg-[#07080C] p-2">
                  {/* Hit-zone bar near bottom */}
                  <div
                    className="pointer-events-none absolute inset-x-0 bottom-12 h-3 border-y border-orange-500/70 bg-orange-500/15"
                    aria-hidden="true"
                  />

                  {RHYTHM_LANES.map((laneDef) => {
                    const laneCues = rhythmCues.filter((c) => {
                      if (c.lane !== laneDef.lane || c.hitState !== 'pending') return false;
                      const diff = c.targetTimeMs - rhythmElapsedMs;
                      return diff <= RHYTHM_LOOKAHEAD_MS && diff >= -220;
                    });
                    const isFlashing = flashLane === laneDef.lane;

                    return (
                      <div
                        key={laneDef.lane}
                        className={`relative flex flex-col justify-end rounded-md border border-zinc-800/80 transition-colors ${
                          isFlashing ? 'bg-zinc-800/80' : 'bg-zinc-900/40'
                        }`}
                      >
                        {laneCues.map((cue) => {
                          const progress =
                            1 - (cue.targetTimeMs - rhythmElapsedMs) / RHYTHM_LOOKAHEAD_MS;
                          const topPct = Math.max(-8, Math.min(84, progress * 78));
                          return (
                            <div
                              key={cue.id}
                              style={{
                                top: `${topPct}%`,
                                backgroundColor: laneDef.color,
                              }}
                              className="pointer-events-none absolute inset-x-1.5 rounded-md py-1 text-center text-[10px] font-extrabold text-zinc-950 shadow-md"
                            >
                              {cue.actionLabel}
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => triggerRhythmLane(laneDef.lane)}
                          style={{ borderColor: laneDef.color }}
                          className="relative z-10 m-1 rounded-md border-2 bg-[#13151C] py-2 text-center hover:bg-zinc-800 active:scale-95"
                        >
                          <div className="font-mono text-xs font-extrabold text-white">
                            {laneDef.keyChar}
                          </div>
                          <div className="text-[10px] text-zinc-400">{laneDef.label}</div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Idle / Summary CTA */}
                {rhythmState !== 'playing' && (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-[#13151C] px-4 py-3">
                    <div className="text-xs text-zinc-300">
                      {rhythmState === 'summary' ? (
                        <span>
                          Hoàn thành! Điểm: <strong className="text-[#FF6B1A]">{rhythmScore}</strong> · Max Combo:{' '}
                          <strong className="text-sky-400">{rhythmMaxCombo}</strong>
                        </span>
                      ) : (
                        <span>Chọn tốc độ BPM và nhấn Bắt đầu để hòa nhịp động tác!</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={startRhythmGame}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF6B1A] px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-[#ff7f38]"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>{rhythmState === 'summary' ? 'Chơi lại ván mới' : 'Bắt đầu Nhịp Điệu'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* NEW GAME 2: STROOP COGNITIVE ARENA */}
          {activeGame === 'stroop' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                    Đấu Trường Stroop & Nhanh Mắt (25 Giây)
                  </h2>
                  <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    Kỷ lục: {game.highScores.stroopBestScore ?? 0} điểm · Phân biệt Màu mực vs Nghĩa chữ dưới áp lực thời gian
                  </p>
                </div>
                <span className="rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-1 font-mono text-sm font-bold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                  {stroopTimeLeft}s · {stroopScore} điểm
                </span>
              </div>

              {stroopPhase === 'idle' || stroopPhase === 'done' ? (
                <div className="mt-5 rounded-xl border border-zinc-800 bg-[#0A0B0E] p-8 text-center text-white">
                  <div className="font-display text-xl font-bold">
                    {stroopPhase === 'done'
                      ? `Hết giờ! Bạn đạt ${stroopScore} điểm`
                      : 'Thử thách Não bộ: Phá bẫy Hiệu ứng Stroop'}
                  </div>
                  <p className="mx-auto mt-2 max-w-md text-xs text-zinc-300">
                    Mỗi lượt hãy đọc kỹ yêu cầu ở trên — lúc thì chọn ĐÚNG MÀU MỰC, lúc lại phải chọn ĐÚNG NGHĨA CHỮ. Chuỗi đúng càng dài điểm thưởng càng cao!
                  </p>
                  <button
                    type="button"
                    onClick={startStroopArena}
                    className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#FF6B1A] px-5 py-2.5 text-xs font-bold text-zinc-950 hover:bg-[#ff7f38]"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    <span>{stroopPhase === 'done' ? 'Thử lại 25 giây' : 'Bắt đầu Đấu Trường Stroop'}</span>
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border border-zinc-800 bg-[#0A0B0E] p-7 text-center">
                    <div className="inline-block rounded-md border border-zinc-700 bg-[#13151C] px-3 py-1 text-xs font-semibold text-amber-300">
                      {stroopRound.promptVi}
                    </div>
                    <div
                      style={{ color: stroopRound.inkHex }}
                      className="mt-5 font-display text-4xl sm:text-5xl font-black tracking-wide"
                    >
                      {stroopRound.wordText}
                    </div>
                    <div className="mt-2 font-mono text-xs text-zinc-400">
                      Chuỗi hiện tại: x{stroopStreak}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    {stroopRound.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleStroopChoice(opt.id)}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-3 px-2 text-xs font-bold text-zinc-900 hover:border-orange-500 dark:border-zinc-700 dark:bg-[#0D0F14] dark:text-zinc-100"
                      >
                        <span
                          className="h-4 w-8 rounded"
                          style={{ backgroundColor: opt.hex }}
                          aria-hidden="true"
                        />
                        <span>{opt.labelVi}</span>
                      </button>
                    ))}
                  </div>

                  {stroopFeedback && (
                    <p className="text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">
                      {stroopFeedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {activeGame === '3d_world' && (
            <World3DExplorer
              suitColor={game.avatarStyle.suitColor}
              visorColor={game.avatarStyle.visorColor}
              companionName={game.avatarStyle.companionName}
              onCollectOrb={(count) => {
                onAddXp(20, count >= 5 ? 'Nhà Thám hiểm 3D' : undefined);
                onUpdateHighScore({ worldOrbsCollected: game.highScores.worldOrbsCollected + 1 });
              }}
            />
          )}

          {activeGame === 'memory' && (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                    Lật thẻ Rèn luyện Trí nhớ
                  </h2>
                  <p className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
                    Số lượt lật: {memoryMoves} · Kỷ lục: {game.highScores.memoryMovesBest ?? '--'} lượt
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetMemory}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Chơi ván mới</span>
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4">
                {cards.map((card, idx) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => handleFlipCard(idx)}
                    aria-label={`Thẻ ${idx + 1}`}
                    className={`flex h-24 flex-col items-center justify-center rounded-xl border text-center transition-transform ${
                      card.flipped || card.matched
                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/40'
                        : 'border-stone-200 bg-stone-100 hover:border-orange-300 dark:border-zinc-700 dark:bg-zinc-800'
                    }`}
                  >
                    {card.flipped || card.matched ? (
                      <>
                        <span className="text-2xl">{card.symbol}</span>
                        <span className="mt-1 text-xs font-medium text-slate-800 dark:text-slate-200">
                          {card.label}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-lg font-bold text-slate-400">?</span>
                    )}
                  </button>
                ))}
              </div>

              {memoryWon && (
                <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                  Tuyệt vời! Bạn đã ghép đủ 6 cặp sau {memoryMoves} lượt và nhận +40 XP.
                </div>
              )}
            </div>
          )}

          {activeGame === 'reflex' && (
            <div className="text-center">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Kiểm tra Phản xạ Thần kinh (ms)
              </h2>
              <p className="mt-1 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                Kỷ lục nhanh nhất: {game.highScores.reflexMsBest ? `${game.highScores.reflexMsBest} ms` : '--'}
              </p>

              <button
                type="button"
                onClick={reflexPhase === 'idle' || reflexPhase === 'done' ? startReflexTest : handleReflexClick}
                className={`mt-6 flex h-56 w-full flex-col items-center justify-center rounded-xl border text-white transition-colors ${
                  reflexPhase === 'ready'
                    ? 'border-emerald-500 bg-emerald-600'
                    : reflexPhase === 'waiting'
                      ? 'border-amber-500 bg-amber-600'
                      : 'border-slate-700 bg-slate-900'
                }`}
              >
                <span className="font-display text-xl font-bold">
                  {reflexPhase === 'idle' && 'Nhấn để bắt đầu đo phản xạ'}
                  {reflexPhase === 'waiting' && 'Chờ màn hình chuyển XANH LÁ...'}
                  {reflexPhase === 'ready' && 'BẤM NGAY!'}
                  {reflexPhase === 'done' && `${reflexMs} ms — Nhấn để thử lại`}
                </span>
                {reflexMs === -1 && (
                  <span className="mt-2 text-xs text-amber-200">Bạn đã bấm sớm trước khi đổi màu!</span>
                )}
              </button>
            </div>
          )}

          {activeGame === 'math' && (
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Tính nhẩm Tốc độ
                </h2>
                <span className="font-mono text-xs text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                  Chuỗi hiện tại: {mathStreak} · Kỷ lục: {game.highScores.mathStreakBest}
                </span>
              </div>

              <div className="my-6 rounded-xl border border-stone-200 bg-stone-50 py-10 text-center dark:border-zinc-800 dark:bg-[#0D0F14]">
                <div className="font-mono text-4xl font-bold text-slate-900 tabular-nums dark:text-slate-100">
                  {mathChallenge.question}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {mathChallenge.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleMathAnswer(opt)}
                    className="rounded-xl border border-stone-200 py-4 font-mono text-lg font-bold text-zinc-900 hover:border-orange-500 hover:bg-orange-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-orange-950/40"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {mathFeedback && <p className="mt-4 text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">{mathFeedback}</p>}
            </div>
          )}

          {activeGame === 'logic' && (
            <div>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                  Giải đố Quy luật Logic
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setLogicIdx((i) => i + 1);
                    setLogicFeedback(null);
                  }}
                  className="text-xs font-medium text-orange-600 hover:underline dark:text-[#FF6B1A]"
                >
                  Đổi câu đố khác
                </button>
              </div>
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">{currentLogic.prompt}</p>

              <div className="my-5 flex flex-wrap items-center justify-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-6 dark:border-zinc-800 dark:bg-[#0D0F14]">
                {currentLogic.sequence.map((item, idx) => (
                  <span
                    key={idx}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-slate-300 bg-white font-mono text-lg font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    {item}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {currentLogic.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleLogicAnswer(opt)}
                    className="rounded-xl border border-stone-200 py-3 font-mono text-base font-bold text-zinc-900 hover:border-orange-500 dark:border-zinc-700 dark:text-zinc-100"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {logicFeedback && (
                <p className="mt-4 text-xs font-medium text-slate-700 dark:text-slate-300">{logicFeedback}</p>
              )}
            </div>
          )}

          {activeGame === 'vocab' && (
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Thử thách Từ vựng Đa ngôn ngữ
              </h2>
              <div className="my-6 rounded-xl border border-stone-200 bg-stone-50 p-8 text-center dark:border-zinc-800 dark:bg-[#0D0F14]">
                <div className="text-xs text-slate-500">
                  Ngôn ngữ: {vocabTarget.languageCode.toUpperCase()} · Cấp {vocabTarget.level}
                </div>
                <div className="mt-2 font-display text-3xl font-bold text-slate-900 dark:text-slate-100">
                  {vocabTarget.word}
                </div>
                <div className="mt-1 font-mono text-xs text-orange-600 dark:text-[#FF6B1A]">
                  {vocabTarget.phonetic}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {vocabOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      if (opt === vocabTarget.meaningVi) {
                        setVocabFeedback('Chính xác! +20 XP');
                        soundEngine.playGameFeedback('match');
                        onAddXp(20);
                        setVocabIdx((i) => i + 1);
                      } else {
                        setVocabFeedback('Chưa chính xác, hãy thử lại!');
                        soundEngine.playGameFeedback('error');
                      }
                    }}
                    className="rounded-lg border border-stone-200 p-3 text-left text-xs font-medium text-zinc-800 hover:border-orange-500 dark:border-zinc-700 dark:text-zinc-200"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {vocabFeedback && (
                <p className="mt-3 text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">{vocabFeedback}</p>
              )}
            </div>
          )}
        </section>

        {/* Right: Badges, Daily Quests & Opt-in Leaderboard */}
        <aside className="space-y-6 lg:col-span-4">
          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
              Huy hiệu & Nhiệm vụ Hàng ngày
            </h3>
            <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
              {game.badges.map((b) => (
                <div key={b} className="flex items-center gap-2">
                  <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span>{b}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <div>• Bắt nhịp Fitness Rhythm (+20–120 XP)</div>
              <div>• Phá bẫy Stroop 25 giây (+15–90 XP)</div>
              <div>• Thu thập Ngọc & Vòng Công viên 3D (+20 XP)</div>
              <div>• Chơi Game Kid Bé Hứng Sao (+15–250 XP)</div>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Trophy className="h-4 w-4 text-amber-500" />
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bảng Xếp hạng Tùy chọn
                </h3>
              </div>
              <button
                type="button"
                onClick={handleSubmitLeaderboard}
                className="text-xs font-semibold text-orange-600 hover:underline dark:text-[#FF6B1A]"
              >
                Gửi điểm
              </button>
            </div>

            {lbMessage && <p className="mt-2 text-[11px] text-orange-600 dark:text-[#FF6B1A]">{lbMessage}</p>}

            <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {leaderboard.slice(0, 6).map((row, idx) => (
                <div key={row.id} className="flex items-center justify-between py-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-400 w-4">#{idx + 1}</span>
                    <span className="truncate font-medium text-slate-800 dark:text-slate-200">
                      {row.name}
                    </span>
                  </div>
                  <span className="font-mono text-slate-600 tabular-nums dark:text-slate-300">
                    Lv.{row.level} · {row.xp} XP
                  </span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
