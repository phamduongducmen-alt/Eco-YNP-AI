import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Brain,
  CheckCircle2,
  Cpu,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Volume2,
  XCircle,
} from 'lucide-react';
import { ENGLISH_TOPIC_LIST } from '../data/englishGames';
import type { CefrLevel, VoiceGender } from '../types/lifeworld';
import {
  buildEnglishRoundQuestions,
  buildLocalCognitiveAnalysis,
  buildSpeechCoachFocus,
  buildTopicPairMatchDeck,
  ENGLISH_GAME_MODES,
  getItemsForTopic,
  validateSentenceBuilder,
  type CombinedMultiAiAnalysis,
  type EnglishGameMode,
  type EnglishPairCard,
  type EnglishQuizQuestion,
  type EnglishRoundAnswerRecord,
  type EnglishTopicFilter,
} from '../utils/englishGameEngine';
import { soundEngine } from '../utils/soundEngine';
import { speakWithAiVoice } from '../utils/voiceEngine';

interface EnglishTopicArenaProps {
  displayName: string;
  userLevel: CefrLevel;
  fitnessGoal: string;
  workoutsCount: number;
  bestArenaScore: number;
  aiConfigured: boolean;
  claudeConfigured: boolean;
  aiVoiceGender?: VoiceGender;
  onAddXp: (amount: number, badge?: string) => void;
  onUpdateArenaBestScore: (score: number) => void;
  onNavigateToLanguages?: () => void;
}

const ROUND_SIZE = 6;

export const EnglishTopicArena: React.FC<EnglishTopicArenaProps> = ({
  displayName,
  userLevel,
  fitnessGoal,
  workoutsCount,
  bestArenaScore,
  aiConfigured,
  claudeConfigured,
  aiVoiceGender = 'female',
  onAddXp,
  onUpdateArenaBestScore,
  onNavigateToLanguages,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<EnglishTopicFilter>('daily');
  const [selectedMode, setSelectedMode] = useState<EnglishGameMode>('vocab_speed');
  const [roundSeed, setRoundSeed] = useState(1);

  // Quiz & Sentence Builder state (used by vocab_speed, context_cloze, sentence_builder)
  const [questions, setQuestions] = useState<EnglishQuizQuestion[]>(() =>
    buildEnglishRoundQuestions('daily', 'vocab_speed', ROUND_SIZE, 1)
  );
  const [questionIdx, setQuestionIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [builderPickedIndices, setBuilderPickedIndices] = useState<number[]>([]);
  const [builderChecked, setBuilderChecked] = useState<{
    isCorrect: boolean;
    expected: string;
  } | null>(null);

  // Pair Match state
  const [pairCards, setPairCards] = useState<EnglishPairCard[]>(() =>
    buildTopicPairMatchDeck('daily', 1)
  );
  const [pickedPairIds, setPickedPairIds] = useState<string[]>([]);
  const [pairFeedback, setPairFeedback] = useState<string | null>(null);

  // Score & Telemetry state
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [roundRecords, setRoundRecords] = useState<EnglishRoundAnswerRecord[]>([]);
  const [roundFinished, setRoundFinished] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  // Multi-AI Combined Analysis state
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<CombinedMultiAiAnalysis | null>(null);

  const questionShownTsRef = useRef<number>(Date.now());
  const roundRecordsRef = useRef<EnglishRoundAnswerRecord[]>([]);
  roundRecordsRef.current = roundRecords;

  const activeTopicMeta = useMemo(
    () => ENGLISH_TOPIC_LIST.find((t) => t.id === selectedTopic) ?? null,
    [selectedTopic]
  );

  const activeModeMeta = useMemo(
    () => ENGLISH_GAME_MODES.find((m) => m.id === selectedMode) ?? ENGLISH_GAME_MODES[0],
    [selectedMode]
  );

  const startFreshRound = useCallback(
    (topic: EnglishTopicFilter, mode: EnglishGameMode, nextSeed: number) => {
      setRoundSeed(nextSeed);
      setQuestionIdx(0);
      setSelectedOption(null);
      setBuilderPickedIndices([]);
      setBuilderChecked(null);
      setPickedPairIds([]);
      setPairFeedback(null);
      setRoundRecords([]);
      roundRecordsRef.current = [];
      setRoundFinished(false);
      setAnalysisResult(null);
      setAnalysisError(null);
      setScore(0);
      setStreak(0);
      questionShownTsRef.current = Date.now();

      if (mode === 'pair_match') {
        setPairCards(buildTopicPairMatchDeck(topic, nextSeed));
      } else {
        setQuestions(buildEnglishRoundQuestions(topic, mode, ROUND_SIZE, nextSeed));
      }
    },
    []
  );

  const handleSelectTopic = (topic: EnglishTopicFilter) => {
    setSelectedTopic(topic);
    startFreshRound(topic, selectedMode, roundSeed + 1);
  };

  const handleSelectMode = (mode: EnglishGameMode) => {
    setSelectedMode(mode);
    startFreshRound(selectedTopic, mode, roundSeed + 1);
  };

  const speakEnglishText = async (text: string, tagId: string) => {
    await speakWithAiVoice({
      text,
      languageCode: 'en',
      bcp47: 'en-US',
      gender: aiVoiceGender,
      rate: 0.94,
      styleContext: 'language',
      onStart: () => setSpeakingId(tagId),
      onEnd: () => setSpeakingId(null),
    });
  };

  const runCombinedMultiAiAnalysis = useCallback(
    async (
      recordsOverride?: EnglishRoundAnswerRecord[],
      topicOverride?: EnglishTopicFilter,
      modeOverride?: EnglishGameMode
    ) => {
      const targetRecords = recordsOverride ?? roundRecordsRef.current;
      const tFilter = topicOverride ?? selectedTopic;
      const mMode = modeOverride ?? selectedMode;

      const localCognitive = buildLocalCognitiveAnalysis({
        records: targetRecords,
        selectedTopic: tFilter,
        selectedMode: mMode,
        userLevel,
        workoutsCount,
      });
      const localSpeech = buildSpeechCoachFocus(targetRecords, tFilter);

      setAnalysisLoading(true);
      setAnalysisError(null);

      try {
        const resp = await fetch('/api/games/english-analysis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            records: targetRecords,
            selectedTopic: tFilter,
            selectedMode: mMode,
            userProfile: {
              displayName,
              languageLevel: userLevel,
              goal: fitnessGoal,
              workoutsCount,
            },
          }),
        });
        const json = (await resp.json()) as CombinedMultiAiAnalysis & { error?: string };
        if (!resp.ok) {
          throw new Error(json.error || 'Không thể chạy phân tích kết hợp Đa AI.');
        }
        setAnalysisResult(json);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Lỗi kết nối máy chủ phân tích AI';
        setAnalysisError(message);
        // Preserve deterministic Cognitive & Speech engines even if network call fails
        setAnalysisResult({
          analyzedAt: new Date().toISOString(),
          cognitiveMetrics: localCognitive,
          providers: {
            gemini: {
              status: aiConfigured ? 'error' : 'unconfigured',
              model: 'gemini-4-hydrogen',
              data: null,
              message,
            },
            claude: {
              status: claudeConfigured ? 'error' : 'unconfigured',
              model: 'claude-sonnet-4-5',
              data: null,
              message,
            },
            speechCoach: localSpeech,
          },
          combinedVerdictVi: `Độ chính xác ${localCognitive.accuracyPct}% · Tốc độ TB ${localCognitive.avgResponseMs}ms (${localCognitive.speedProfile}) · CEFR ${localCognitive.estimatedCefr}.`,
        });
      } finally {
        setAnalysisLoading(false);
      }
    },
    [
      aiConfigured,
      claudeConfigured,
      displayName,
      fitnessGoal,
      selectedMode,
      selectedTopic,
      userLevel,
      workoutsCount,
    ]
  );

  // Finish round hook
  const finalizeRound = useCallback(
    (finalScore: number, allRecords: EnglishRoundAnswerRecord[]) => {
      setRoundFinished(true);
      if (finalScore > bestArenaScore) {
        onUpdateArenaBestScore(finalScore);
      }
      const correctN = allRecords.filter((r) => r.isCorrect).length;
      const bonusXp = correctN >= 5 ? 25 : 10;
      onAddXp(
        bonusXp,
        correctN === allRecords.length && allRecords.length >= 5
          ? 'Bậc thầy Tiếng Anh Đa Chủ đề'
          : undefined
      );
      soundEngine.playGameFeedback('win');
      void runCombinedMultiAiAnalysis(allRecords, selectedTopic, selectedMode);
    },
    [
      bestArenaScore,
      onAddXp,
      onUpdateArenaBestScore,
      runCombinedMultiAiAnalysis,
      selectedMode,
      selectedTopic,
    ]
  );

  // Auto-reset timer ref when switching active question
  useEffect(() => {
    questionShownTsRef.current = Date.now();
  }, [questionIdx, selectedMode, selectedTopic, roundSeed]);

  const currentQuestion = questions[questionIdx] ?? null;

  const handleChooseOption = (opt: string) => {
    if (!currentQuestion || selectedOption !== null || roundFinished) return;
    const elapsedMs = Math.max(400, Date.now() - questionShownTsRef.current);
    const isCorrect = opt === currentQuestion.correctAnswer;

    setSelectedOption(opt);

    const nextStreak = isCorrect ? streak + 1 : 0;
    const pts = isCorrect ? 30 + Math.min(40, nextStreak * 8) : 0;
    const nextScore = score + pts;

    if (isCorrect) {
      soundEngine.playGameFeedback('match');
      onAddXp(activeModeMeta.xpPerCorrect);
    } else {
      soundEngine.playGameFeedback('error');
    }

    setStreak(nextStreak);
    setScore(nextScore);

    const rec: EnglishRoundAnswerRecord = {
      itemId: currentQuestion.item.id,
      word: currentQuestion.item.word,
      phonetic: currentQuestion.item.phonetic,
      topic: currentQuestion.item.topic,
      level: currentQuestion.item.level,
      mode: currentQuestion.mode,
      promptText: currentQuestion.promptTitle,
      userAnswer: opt,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect,
      responseTimeMs: elapsedMs,
      usageNoteVi: currentQuestion.item.usageNoteVi,
    };
    const nextRecords = [...roundRecords, rec];
    setRoundRecords(nextRecords);

    if (questionIdx >= questions.length - 1) {
      window.setTimeout(() => {
        finalizeRound(nextScore, nextRecords);
      }, 650);
    }
  };

  const handleNextQuestion = () => {
    if (questionIdx < questions.length - 1) {
      setQuestionIdx((i) => i + 1);
      setSelectedOption(null);
      setBuilderPickedIndices([]);
      setBuilderChecked(null);
      questionShownTsRef.current = Date.now();
    }
  };

  // Sentence Builder handlers
  const handleToggleBuilderToken = (tokenIdx: number) => {
    if (builderChecked || roundFinished) return;
    setBuilderPickedIndices((prev) =>
      prev.includes(tokenIdx) ? prev.filter((i) => i !== tokenIdx) : [...prev, tokenIdx]
    );
  };

  const handleCheckSentenceBuilder = () => {
    if (!currentQuestion || currentQuestion.mode !== 'sentence_builder' || builderChecked) return;
    const tokens = currentQuestion.shuffledTokens ?? [];
    const chosenWords = builderPickedIndices.map((idx) => tokens[idx]);
    const validation = validateSentenceBuilder(
      chosenWords,
      currentQuestion.item.builderSentence
    );
    const elapsedMs = Math.max(600, Date.now() - questionShownTsRef.current);

    setBuilderChecked({ isCorrect: validation.isCorrect, expected: validation.expected });
    const nextStreak = validation.isCorrect ? streak + 1 : 0;
    const pts = validation.isCorrect ? 40 + Math.min(45, nextStreak * 10) : 0;
    const nextScore = score + pts;

    if (validation.isCorrect) {
      soundEngine.playGameFeedback('match');
      onAddXp(activeModeMeta.xpPerCorrect);
    } else {
      soundEngine.playGameFeedback('error');
    }

    setStreak(nextStreak);
    setScore(nextScore);

    const rec: EnglishRoundAnswerRecord = {
      itemId: currentQuestion.item.id,
      word: currentQuestion.item.word,
      phonetic: currentQuestion.item.phonetic,
      topic: currentQuestion.item.topic,
      level: currentQuestion.item.level,
      mode: 'sentence_builder',
      promptText: currentQuestion.promptTitle,
      userAnswer: validation.assembled || '(Trống)',
      correctAnswer: validation.expected,
      isCorrect: validation.isCorrect,
      responseTimeMs: elapsedMs,
      usageNoteVi: currentQuestion.item.usageNoteVi,
    };
    const nextRecords = [...roundRecords, rec];
    setRoundRecords(nextRecords);

    if (questionIdx >= questions.length - 1) {
      window.setTimeout(() => {
        finalizeRound(nextScore, nextRecords);
      }, 750);
    }
  };

  // Pair Match handlers
  const handlePickPairCard = (cardId: string) => {
    if (roundFinished) return;
    const clicked = pairCards.find((c) => c.id === cardId);
    if (!clicked || clicked.matched || pickedPairIds.includes(cardId) || pickedPairIds.length >= 2) {
      return;
    }

    const nextPicked = [...pickedPairIds, cardId];
    setPickedPairIds(nextPicked);

    if (nextPicked.length === 2) {
      const first = pairCards.find((c) => c.id === nextPicked[0]);
      const second = pairCards.find((c) => c.id === nextPicked[1]);
      if (!first || !second) return;

      const elapsedMs = Math.max(500, Date.now() - questionShownTsRef.current);
      questionShownTsRef.current = Date.now();

      const itemPool = getItemsForTopic(selectedTopic);
      const refItem =
        itemPool.find((x) => x.id === first.pairId) ??
        itemPool.find((x) => x.id === second.pairId) ??
        itemPool[0];

      const isMatch = first.pairId === second.pairId && first.side !== second.side;
      if (isMatch) {
        soundEngine.playGameFeedback('match');
        onAddXp(activeModeMeta.xpPerCorrect);
        const nextStreak = streak + 1;
        const pts = 35 + Math.min(35, nextStreak * 7);
        const nextScore = score + pts;
        setStreak(nextStreak);
        setScore(nextScore);
        setPairFeedback(`Ghép chuẩn: ${refItem?.word ?? first.text} (+${pts} điểm)`);

        const updatedDeck = pairCards.map((c) =>
          c.id === first.id || c.id === second.id ? { ...c, matched: true } : c
        );
        setPairCards(updatedDeck);
        setPickedPairIds([]);

        const rec: EnglishRoundAnswerRecord = {
          itemId: refItem?.id ?? first.pairId,
          word: refItem?.word ?? first.text,
          phonetic: refItem?.phonetic ?? '',
          topic: refItem?.topic ?? first.topic,
          level: refItem?.level ?? 'B1',
          mode: 'pair_match',
          promptText: 'Lật cặp song ngữ Anh–Việt',
          userAnswer: `${first.text} ↔ ${second.text}`,
          correctAnswer: `${refItem?.word ?? first.text} ↔ ${refItem?.meaningVi ?? second.text}`,
          isCorrect: true,
          responseTimeMs: elapsedMs,
          usageNoteVi: refItem?.usageNoteVi ?? '',
        };
        const nextRecords = [...roundRecords, rec];
        setRoundRecords(nextRecords);

        if (updatedDeck.every((c) => c.matched)) {
          window.setTimeout(() => {
            finalizeRound(nextScore, nextRecords);
          }, 500);
        }
      } else {
        soundEngine.playGameFeedback('error');
        setStreak(0);
        setPairFeedback(`Chưa khớp cặp ("${first.text}" ≠ "${second.text}"). Thử lại!`);

        const rec: EnglishRoundAnswerRecord = {
          itemId: refItem?.id ?? first.pairId,
          word: refItem?.word ?? first.text,
          phonetic: refItem?.phonetic ?? '',
          topic: refItem?.topic ?? first.topic,
          level: refItem?.level ?? 'B1',
          mode: 'pair_match',
          promptText: 'Lật cặp song ngữ Anh–Việt',
          userAnswer: `${first.text} ↔ ${second.text}`,
          correctAnswer: `${refItem?.word ?? first.text} ↔ ${refItem?.meaningVi ?? ''}`,
          isCorrect: false,
          responseTimeMs: elapsedMs,
          usageNoteVi: refItem?.usageNoteVi ?? '',
        };
        setRoundRecords((prev) => [...prev, rec]);

        window.setTimeout(() => {
          setPickedPairIds([]);
        }, 520);
      }
    }
  };

  const correctTotal = roundRecords.filter((r) => r.isCorrect).length;
  const accuracyLivePct =
    roundRecords.length > 0 ? Math.round((correctTotal / roundRecords.length) * 100) : 100;

  return (
    <div className="space-y-5">
      {/* Header & Live Telemetry Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-600 dark:text-[#FF6B1A]">
            <Sparkles className="h-3.5 w-3.5" />
            <span>ĐẤU TRƯỜNG TIẾNG ANH ĐA CHỦ ĐỀ · KỶ LỤC {bestArenaScore} ĐIỂM</span>
          </div>
          <h2 className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            9 Chủ đề Thực tế · 4 Chế độ Chơi · Phân tích Kết hợp Tất cả AI
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Chọn chủ đề & thể loại game; hệ thống tự động kết hợp Gemini Coach, Claude Strategist, Động cơ Nhận thức & AI Speech TTS để phân tích lỗi sai.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => startFreshRound(selectedTopic, selectedMode, roundSeed + 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 whitespace-nowrap"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Ván mới</span>
          </button>
          <button
            type="button"
            disabled={analysisLoading}
            onClick={() => void runCombinedMultiAiAnalysis()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-60 dark:bg-[#FF6B1A] dark:text-zinc-950 dark:hover:bg-[#ff7f38] whitespace-nowrap"
          >
            {analysisLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Cpu className="h-3.5 w-3.5" />
            )}
            <span>Phân tích Kết hợp Tất cả AI</span>
          </button>
        </div>
      </div>

      {/* 9-Topic Selector Grid */}
      <div>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <span>Chọn Chủ đề Tiếng Anh ({ENGLISH_TOPIC_LIST.length} chủ đề chuyên sâu + Hỗn hợp)</span>
          <span className="font-mono text-orange-600 dark:text-[#FF6B1A]">
            {activeTopicMeta ? `${activeTopicMeta.titleEn} (${activeTopicMeta.cefrRange})` : 'All Topics Mix'}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => handleSelectTopic('all')}
            className={`rounded-lg border px-3 py-2 text-left transition-colors ${
              selectedTopic === 'all'
                ? 'border-orange-500 bg-orange-50/90 text-orange-900 dark:border-[#FF6B1A] dark:bg-[#FF6B1A]/15 dark:text-orange-100'
                : 'border-stone-200 bg-stone-50/70 text-zinc-700 hover:border-orange-300 dark:border-zinc-800 dark:bg-[#0D0F14] dark:text-zinc-300'
            }`}
          >
            <div className="text-xs font-bold leading-snug">Hỗn hợp 9 Chủ đề</div>
            <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-zinc-400">
              54 từ · A1–C1
            </div>
          </button>
          {ENGLISH_TOPIC_LIST.map((topic) => {
            const active = selectedTopic === topic.id;
            return (
              <button
                key={topic.id}
                type="button"
                onClick={() => handleSelectTopic(topic.id)}
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? 'border-orange-500 bg-orange-50/90 text-orange-900 dark:border-[#FF6B1A] dark:bg-[#FF6B1A]/15 dark:text-orange-100'
                    : 'border-stone-200 bg-stone-50/70 text-zinc-700 hover:border-orange-300 dark:border-zinc-800 dark:bg-[#0D0F14] dark:text-zinc-300'
                }`}
              >
                <div className="text-xs font-bold leading-snug">{topic.titleVi}</div>
                <div className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                  {topic.cefrRange}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4 Game Mode Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {ENGLISH_GAME_MODES.map((mode) => {
          const active = selectedMode === mode.id;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => handleSelectMode(mode.id)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                  : 'border border-stone-200 bg-white text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-[#0D0F14] dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              {mode.labelVi}
            </button>
          );
        })}
      </div>

      {/* Playable Game Stage (Dark Obsidian Sport Tech Canvas) */}
      <div className="rounded-xl border border-zinc-800 bg-[#0A0B0E] p-5 text-white">
        {/* HUD Row */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/90 pb-3 text-xs">
          <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
            <span>
              Điểm: <strong className="text-[#FF6B1A]">{score}</strong>
            </span>
            <span>
              Combo: <strong className="text-sky-400">x{streak}</strong>
            </span>
            <span>
              Chính xác: <strong className="text-emerald-400">{accuracyLivePct}%</strong>
            </span>
          </div>
          <div className="font-mono text-zinc-400 tabular-nums">
            {selectedMode === 'pair_match'
              ? `Đã ghép ${pairCards.filter((c) => c.matched).length / 2}/6 cặp`
              : `Câu ${Math.min(questionIdx + 1, questions.length)}/${questions.length}`}
          </div>
        </div>

        {/* ROUND SUMMARY SCREEN */}
        {roundFinished ? (
          <div className="py-5 text-center">
            <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              <span>Hoàn thành Vòng Luyện Tập Chủ đề</span>
            </div>
            <h3 className="mt-3 font-display text-2xl font-bold text-white tabular-nums">
              {score} điểm · {correctTotal}/{roundRecords.length} lượt chuẩn ({accuracyLivePct}%)
            </h3>
            <p className="mx-auto mt-1.5 max-w-lg text-xs text-zinc-300">
              Báo cáo Phân tích Kết hợp Đa AI (Gemini + Claude + Động cơ Nhận thức + Speech Coach) đang được tổng hợp ngay bên dưới.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => startFreshRound(selectedTopic, selectedMode, roundSeed + 1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#FF6B1A] px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-[#ff7f38]"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>Chơi vòng tiếp theo</span>
              </button>
              <button
                type="button"
                disabled={analysisLoading}
                onClick={() => void runCombinedMultiAiAnalysis()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-[#13151C] px-4 py-2 text-xs font-semibold text-zinc-100 hover:border-orange-500"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${analysisLoading ? 'animate-spin' : ''}`} />
                <span>Chạy lại Phân tích Đa AI</span>
              </button>
            </div>
          </div>
        ) : selectedMode === 'pair_match' ? (
          /* MODE 4: PAIR MATCH */
          <div>
            <p className="mb-3 text-xs text-zinc-300">
              Chọn 1 thẻ Tiếng Anh và 1 thẻ Nghĩa Tiếng Việt tương ứng theo chủ đề{' '}
              <strong className="text-[#FF6B1A]">
                {activeTopicMeta?.titleVi ?? 'Hỗn hợp 9 Chủ đề'}
              </strong>
              .
            </p>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
              {pairCards.map((card) => {
                const isPicked = pickedPairIds.includes(card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    disabled={card.matched}
                    onClick={() => handlePickPairCard(card.id)}
                    className={`min-h-[78px] rounded-xl border p-3 text-left transition-all ${
                      card.matched
                        ? 'border-emerald-500/40 bg-emerald-950/35 text-emerald-200 opacity-75'
                        : isPicked
                          ? 'border-[#FF6B1A] bg-[#FF6B1A]/15 text-white'
                          : 'border-zinc-800 bg-[#13151C] text-zinc-100 hover:border-zinc-600'
                    }`}
                  >
                    <div className="font-mono text-[10px] uppercase tracking-wide text-zinc-400">
                      {card.side === 'en' ? 'English' : 'Tiếng Việt'}
                    </div>
                    <div className="mt-1 text-xs font-bold leading-snug">{card.text}</div>
                    {card.phonetic && (
                      <div className="mt-0.5 font-mono text-[10px] text-orange-300">
                        {card.phonetic}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {pairFeedback && (
              <p className="mt-3 text-xs font-medium text-amber-300">{pairFeedback}</p>
            )}
          </div>
        ) : currentQuestion ? (
          /* MODES 1, 2, 3: QUIZ / CLOZE / SENTENCE BUILDER */
          <div>
            <div className="rounded-xl border border-zinc-800 bg-[#13151C] p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-[11px] uppercase tracking-wide text-zinc-400">
                  {activeModeMeta.labelVi} · {currentQuestion.item.topic.toUpperCase()} ·{' '}
                  {currentQuestion.item.level}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void speakEnglishText(
                      currentQuestion.mode === 'vocab_speed'
                        ? currentQuestion.item.word
                        : currentQuestion.item.builderSentence,
                      currentQuestion.id
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-orange-300 hover:border-orange-500"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>
                    {speakingId === currentQuestion.id ? 'Đang phát...' : 'Nghe phát âm AI'}
                  </span>
                </button>
              </div>

              <div className="mt-4 text-center">
                <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-snug">
                  {currentQuestion.promptTitle}
                </div>
                <div className="mt-1.5 font-mono text-xs text-orange-300">
                  {currentQuestion.promptSub}
                </div>
              </div>
            </div>

            {/* Mode 1 & 2 Options */}
            {(currentQuestion.mode === 'vocab_speed' ||
              currentQuestion.mode === 'context_cloze') && (
              <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {currentQuestion.options.map((opt) => {
                  const answered = selectedOption !== null;
                  const isChosen = selectedOption === opt;
                  const isCorrectOpt = opt === currentQuestion.correctAnswer;

                  let btnClass =
                    'border-zinc-800 bg-[#13151C] text-zinc-100 hover:border-[#FF6B1A]';
                  if (answered) {
                    if (isCorrectOpt) {
                      btnClass = 'border-emerald-500 bg-emerald-950/60 text-emerald-100';
                    } else if (isChosen) {
                      btnClass = 'border-rose-500 bg-rose-950/60 text-rose-100';
                    } else {
                      btnClass = 'border-zinc-800/70 bg-[#13151C]/60 text-zinc-400';
                    }
                  }

                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={answered}
                      onClick={() => handleChooseOption(opt)}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-xs font-semibold transition-colors ${btnClass}`}
                    >
                      <span>{opt}</span>
                      {answered && isCorrectOpt && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                      {answered && isChosen && !isCorrectOpt && (
                        <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Mode 3 Sentence Builder Interactive Tray */}
            {currentQuestion.mode === 'sentence_builder' && (
              <div className="mt-4 space-y-4">
                <div className="min-h-[60px] rounded-xl border border-dashed border-zinc-700 bg-[#13151C] p-3">
                  <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-zinc-400">
                    Câu bạn ghép (nhấn mảnh từ để bỏ ra):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {builderPickedIndices.length === 0 ? (
                      <span className="text-xs text-zinc-500">
                        Chạm các mảnh từ bên dưới theo đúng thứ tự...
                      </span>
                    ) : (
                      builderPickedIndices.map((tIdx) => {
                        const word = currentQuestion.shuffledTokens?.[tIdx] ?? '';
                        return (
                          <button
                            key={`picked-${tIdx}`}
                            type="button"
                            disabled={Boolean(builderChecked)}
                            onClick={() => handleToggleBuilderToken(tIdx)}
                            className="rounded-lg border border-[#FF6B1A] bg-[#FF6B1A]/15 px-3 py-1.5 text-xs font-bold text-orange-100"
                          >
                            {word}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {(currentQuestion.shuffledTokens ?? []).map((word, idx) => {
                    const alreadyPicked = builderPickedIndices.includes(idx);
                    return (
                      <button
                        key={`bank-${idx}-${word}`}
                        type="button"
                        disabled={alreadyPicked || Boolean(builderChecked)}
                        onClick={() => handleToggleBuilderToken(idx)}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                          alreadyPicked
                            ? 'border-zinc-800 bg-zinc-900/40 text-zinc-600'
                            : 'border-zinc-700 bg-[#13151C] text-zinc-100 hover:border-[#FF6B1A]'
                        }`}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={builderPickedIndices.length === 0 || Boolean(builderChecked)}
                    onClick={handleCheckSentenceBuilder}
                    className="rounded-lg bg-[#FF6B1A] px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-[#ff7f38] disabled:opacity-50"
                  >
                    Kiểm tra Câu
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(builderChecked)}
                    onClick={() => setBuilderPickedIndices([])}
                    className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                  >
                    Xếp lại
                  </button>
                </div>
              </div>
            )}

            {/* Answer Explanation & Next Question Button */}
            {(selectedOption !== null || builderChecked !== null) && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-[#13151C] px-4 py-3 text-xs">
                <div className="space-y-0.5">
                  {builderChecked && !builderChecked.isCorrect && (
                    <div className="font-semibold text-emerald-300">
                      Câu chuẩn: {builderChecked.expected}.
                    </div>
                  )}
                  <div className="text-zinc-300">
                    <strong className="text-[#FF6B1A]">Ghi chú sắc thái:</strong>{' '}
                    {currentQuestion.item.usageNoteVi}
                  </div>
                </div>
                {questionIdx < questions.length - 1 && (
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="rounded-lg bg-white px-4 py-2 text-xs font-bold text-zinc-950 hover:bg-zinc-200 whitespace-nowrap"
                  >
                    Câu tiếp theo →
                  </button>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* COMBINED MULTI-AI ANALYSIS DASHBOARD */}
      {(analysisLoading || analysisResult || analysisError) && (
        <section
          aria-label="Phân tích kết hợp tất cả AI"
          className="rounded-xl border border-orange-500/35 bg-stone-50 p-5 dark:border-[#FF6B1A]/35 dark:bg-[#0D0F14]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-3 dark:border-zinc-800">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-orange-600 dark:text-[#FF6B1A]">
                <Layers className="h-4 w-4" />
                <span>PHÂN TÍCH KẾT HỢP ĐA AI (GEMINI + CLAUDE + COGNITIVE + SPEECH)</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-zinc-300">
                {analysisLoading
                  ? 'Đang gửi dữ liệu lượt chơi song song tới các mô hình AI để tổng hợp chẩn đoán...'
                  : analysisResult?.combinedVerdictVi}
              </p>
            </div>
            {analysisResult && (
              <button
                type="button"
                onClick={() =>
                  startFreshRound(
                    analysisResult.cognitiveMetrics.recommendedNextTopic,
                    analysisResult.cognitiveMetrics.recommendedNextMode,
                    roundSeed + 1
                  )
                }
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-500 dark:bg-[#FF6B1A] dark:text-zinc-950 whitespace-nowrap"
              >
                Luyện lộ trình gợi ý ngay →
              </button>
            )}
          </div>

          {analysisError && (
            <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-300">
              Lưu ý kết nối: {analysisError} (Báo cáo Động cơ Nhận thức & AI Speech vẫn hiển thị đầy đủ.)
            </p>
          )}

          {analysisResult && (
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Engine 1: Local Cognitive Telemetry Engine */}
              <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#13151C]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                    <Brain className="h-4 w-4" />
                    <span>1. Động cơ Nhận thức & Telemetry</span>
                  </div>
                  <span className="whitespace-nowrap shrink-0 font-mono text-[11px] font-bold text-slate-700 tabular-nums dark:text-zinc-200">
                    CEFR ~ {analysisResult.cognitiveMetrics.estimatedCefr}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center font-mono tabular-nums">
                  <div className="rounded-lg border border-stone-200 p-2 dark:border-zinc-800">
                    <div className="text-[10px] text-slate-500 dark:text-zinc-400">Độ chính xác</div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {analysisResult.cognitiveMetrics.accuracyPct}%
                    </div>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-2 dark:border-zinc-800">
                    <div className="text-[10px] text-slate-500 dark:text-zinc-400">Phản xạ TB</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {analysisResult.cognitiveMetrics.avgResponseMs}ms
                    </div>
                  </div>
                  <div className="rounded-lg border border-stone-200 p-2 dark:border-zinc-800">
                    <div className="text-[10px] text-slate-500 dark:text-zinc-400">Nhịp độ</div>
                    <div className="text-[11px] font-bold leading-tight text-orange-600 dark:text-[#FF6B1A]">
                      {analysisResult.cognitiveMetrics.speedProfile}
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-slate-700 dark:text-zinc-300">
                  {analysisResult.cognitiveMetrics.errorPatterns.map((pat, i) => (
                    <div key={i}>• {pat}</div>
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-emerald-50/70 p-2.5 text-[11px] text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                  <strong>Liên kết NexaLife OS:</strong>{' '}
                  {analysisResult.cognitiveMetrics.crossModuleSynergyVi}
                </div>
              </div>

              {/* Engine 2: Gemini Pedagogical Coach */}
              <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#13151C]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-400">
                    <Sparkles className="h-4 w-4" />
                    <span>2. Gemini Pedagogical Coach</span>
                  </div>
                  <span className="whitespace-nowrap shrink-0 font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                    {analysisResult.providers.gemini.model}
                  </span>
                </div>

                {analysisResult.providers.gemini.status === 'ok' &&
                analysisResult.providers.gemini.data ? (
                  <div className="mt-3 space-y-2.5 text-xs text-slate-700 dark:text-zinc-300">
                    <p className="leading-relaxed">
                      {analysisResult.providers.gemini.data.coachSummary}
                    </p>
                    {analysisResult.providers.gemini.data.grammarAndUsageFixes.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          Điểm cần sửa trọng tâm:
                        </div>
                        {analysisResult.providers.gemini.data.grammarAndUsageFixes
                          .slice(0, 3)
                          .map((fix, idx) => (
                            <div
                              key={idx}
                              className="rounded-lg border border-stone-200 p-2 text-[11px] dark:border-zinc-800"
                            >
                              <strong className="text-sky-700 dark:text-sky-300">{fix.word}:</strong>{' '}
                              {fix.issueVi} — <em>{fix.fixTipVi}</em>
                            </div>
                          ))}
                      </div>
                    )}
                    <div className="text-[11px]">
                      <strong>Nhắc lại ngắt quãng:</strong>{' '}
                      {analysisResult.providers.gemini.data.spacedRepetitionPlan.join(' · ')}
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-500 dark:text-zinc-400">
                    {analysisResult.providers.gemini.message ||
                      'Cần cấu hình GEMINI_API_KEY trên máy chủ để nhận phân tích sâu từ Gemini.'}
                  </p>
                )}
              </div>

              {/* Engine 3: Claude Linguistic & Nuance Strategist */}
              <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#13151C]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-orange-700 dark:text-[#FF6B1A]">
                    <Cpu className="h-4 w-4" />
                    <span>3. Claude Nuance & Story Strategist</span>
                  </div>
                  <span className="whitespace-nowrap shrink-0 font-mono text-[10px] text-slate-500 dark:text-zinc-400">
                    {analysisResult.providers.claude.model}
                  </span>
                </div>

                {analysisResult.providers.claude.status === 'ok' &&
                analysisResult.providers.claude.data ? (
                  <div className="mt-3 space-y-2.5 text-xs text-slate-700 dark:text-zinc-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-slate-900 dark:text-white">
                        {analysisResult.providers.claude.data.storyTitle}
                      </strong>
                      <button
                        type="button"
                        onClick={() =>
                          void speakEnglishText(
                            analysisResult.providers.claude.data?.miniDialogueOrStory || '',
                            'claude-story'
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-orange-500/40 px-2 py-1 text-[11px] font-semibold text-orange-700 dark:text-[#FF6B1A]"
                      >
                        <Volume2 className="h-3 w-3" />
                        <span>Nghe Mini-Story</span>
                      </button>
                    </div>
                    <p className="rounded-lg border border-stone-200 bg-stone-50 p-2.5 text-xs italic text-slate-800 dark:border-zinc-800 dark:bg-[#0D0F14] dark:text-zinc-100">
                      {analysisResult.providers.claude.data.miniDialogueOrStory}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Dịch: {analysisResult.providers.claude.data.storyTranslationVi}
                    </p>
                    {analysisResult.providers.claude.data.memoryHooks.length > 0 && (
                      <div className="text-[11px]">
                        <strong>Mẹo ghi nhớ:</strong>{' '}
                        {analysisResult.providers.claude.data.memoryHooks.join(' · ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-zinc-400">
                    <p>
                      {analysisResult.providers.claude.message ||
                        'Claude chưa kích hoạt trên máy chủ (thiếu ANTHROPIC_API_KEY trong Settings > Secrets).'}
                    </p>
                    <p className="text-[11px]">
                      Khi kết nối ANTHROPIC_API_KEY, Claude sẽ tự động viết hội thoại ngữ cảnh chứa các từ bạn vừa sai và phân tích sắc thái bản ngữ song song với Gemini.
                    </p>
                  </div>
                )}
              </div>

              {/* Engine 4: AI Speech & Pronunciation Coach */}
              <div className="rounded-xl border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-[#13151C]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400">
                    <AudioLines className="h-4 w-4" />
                    <span>4. AI Speech & Pronunciation Coach</span>
                  </div>
                  {onNavigateToLanguages && (
                    <button
                      type="button"
                      onClick={onNavigateToLanguages}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Mở Phòng Ngoại ngữ →
                    </button>
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-600 dark:text-zinc-300">
                  {analysisResult.providers.speechCoach.drillInstructionVi}
                </p>

                <div className="mt-3 space-y-2">
                  {analysisResult.providers.speechCoach.targetWords.map((tw) => (
                    <div
                      key={tw.word}
                      className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 dark:border-zinc-800"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs text-slate-900 dark:text-white">
                            {tw.word}
                          </strong>
                          <span className="font-mono text-[11px] text-orange-600 dark:text-[#FF6B1A]">
                            {tw.phonetic}
                          </span>
                        </div>
                        <div className="truncate text-[11px] text-slate-500 dark:text-zinc-400">
                          {tw.practiceTipVi}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void speakEnglishText(tw.word, `speech-${tw.word}`)}
                        aria-label={`Nghe phát âm ${tw.word}`}
                        className="shrink-0 rounded-md border border-indigo-500/35 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                      >
                        {speakingId === `speech-${tw.word}` ? 'Đang đọc...' : 'Nghe'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
