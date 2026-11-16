import {
  ENGLISH_TOPIC_ITEMS,
  ENGLISH_TOPIC_LIST,
  type EnglishGameTopicId,
  type EnglishTopicMeta,
  type EnglishTopicQuestionItem,
} from '../data/englishGames';
import type { CefrLevel } from '../types/lifeworld';

export type EnglishGameMode =
  | 'vocab_speed'
  | 'context_cloze'
  | 'sentence_builder'
  | 'pair_match';

export type EnglishTopicFilter = 'all' | EnglishGameTopicId;

export interface EnglishGameModeMeta {
  id: EnglishGameMode;
  labelVi: string;
  shortDescVi: string;
  xpPerCorrect: number;
}

export const ENGLISH_GAME_MODES: EnglishGameModeMeta[] = [
  {
    id: 'vocab_speed',
    labelVi: 'Từ vựng Tốc độ',
    shortDescVi: 'Nghe IPA & chọn nghĩa đúng chuẩn xác dưới áp lực phản xạ.',
    xpPerCorrect: 18,
  },
  {
    id: 'context_cloze',
    labelVi: 'Điền từ Ngữ cảnh',
    shortDescVi: 'Hoàn thiện câu giao tiếp thực tế đúng từ vựng & sắc thái.',
    xpPerCorrect: 22,
  },
  {
    id: 'sentence_builder',
    labelVi: 'Ghép câu Giao tiếp',
    shortDescVi: 'Sắp xếp các mảnh từ bị đảo thành câu tiếng Anh tự nhiên.',
    xpPerCorrect: 26,
  },
  {
    id: 'pair_match',
    labelVi: 'Lật cặp Song ngữ',
    shortDescVi: 'Nối 6 cặp Anh – Việt theo đúng chủ đề để rèn trí nhớ sâu.',
    xpPerCorrect: 20,
  },
];

export interface EnglishQuizQuestion {
  id: string;
  item: EnglishTopicQuestionItem;
  mode: Exclude<EnglishGameMode, 'pair_match'>;
  promptTitle: string;
  promptSub: string;
  options: string[];
  correctAnswer: string;
  /** Token list for sentence_builder */
  targetTokens?: string[];
  shuffledTokens?: string[];
}

export interface EnglishPairCard {
  id: string;
  pairId: string;
  side: 'en' | 'vi';
  text: string;
  phonetic?: string;
  topic: EnglishGameTopicId;
  matched: boolean;
}

export interface EnglishRoundAnswerRecord {
  itemId: string;
  word: string;
  phonetic: string;
  topic: EnglishGameTopicId;
  level: CefrLevel;
  mode: EnglishGameMode;
  promptText: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  responseTimeMs: number;
  usageNoteVi: string;
}

export interface TopicMasterySummary {
  topicId: EnglishGameTopicId;
  titleVi: string;
  total: number;
  correct: number;
  accuracyPct: number;
  avgMs: number;
}

export interface CognitiveAnalysisReport {
  totalQuestions: number;
  correctCount: number;
  accuracyPct: number;
  avgResponseMs: number;
  speedProfile: 'Phản xạ Nhanh' | 'Nhịp độ Cân bằng' | 'Cần tăng Phản xạ';
  estimatedCefr: CefrLevel;
  strongestTopic: TopicMasterySummary | null;
  weakestTopic: TopicMasterySummary | null;
  topicBreakdown: TopicMasterySummary[];
  errorPatterns: string[];
  recommendedNextTopic: EnglishGameTopicId;
  recommendedNextMode: EnglishGameMode;
  crossModuleSynergyVi: string;
}

export interface GeminiCoachAnalysis {
  coachSummary: string;
  grammarAndUsageFixes: Array<{
    word: string;
    issueVi: string;
    fixTipVi: string;
  }>;
  spacedRepetitionPlan: string[];
  nextTopicRecommendation: string;
  wellnessSynergyTip: string;
}

export interface ClaudeLinguistAnalysis {
  storyTitle: string;
  miniDialogueOrStory: string;
  storyTranslationVi: string;
  nuanceComparisons: Array<{
    term: string;
    nuanceVi: string;
    collocation: string;
  }>;
  memoryHooks: string[];
  speakingChallengePrompt: string;
}

export interface SpeechCoachFocus {
  ready: boolean;
  targetWords: Array<{
    word: string;
    phonetic: string;
    practiceTipVi: string;
  }>;
  drillInstructionVi: string;
}

export interface CombinedMultiAiAnalysis {
  analyzedAt: string;
  cognitiveMetrics: CognitiveAnalysisReport;
  providers: {
    gemini: {
      status: 'ok' | 'unconfigured' | 'error';
      model: string;
      data: GeminiCoachAnalysis | null;
      message?: string;
    };
    claude: {
      status: 'ok' | 'unconfigured' | 'error';
      model: string;
      data: ClaudeLinguistAnalysis | null;
      message?: string;
    };
    speechCoach: SpeechCoachFocus;
  };
  combinedVerdictVi: string;
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = Math.abs(Math.floor(seed * 9973)) + 17;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function getEnglishTopics(): EnglishTopicMeta[] {
  return ENGLISH_TOPIC_LIST;
}

export function getItemsForTopic(topicFilter: EnglishTopicFilter): EnglishTopicQuestionItem[] {
  if (topicFilter === 'all') {
    return ENGLISH_TOPIC_ITEMS;
  }
  return ENGLISH_TOPIC_ITEMS.filter((item) => item.topic === topicFilter);
}

export function tokenizeEnglishSentence(sentence: string): string[] {
  const trimmed = sentence.trim().replace(/[.!?]+$/, '');
  return trimmed.split(/\s+/).filter(Boolean);
}

export function normalizeSentenceForCompare(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?,;:]+$/g, '')
    .replace(/\s+/g, ' ');
}

export function validateSentenceBuilder(
  selectedTokens: string[],
  targetSentence: string
): { isCorrect: boolean; assembled: string; expected: string } {
  const assembled = selectedTokens.join(' ').trim();
  const expected = targetSentence.trim().replace(/[.!?]+$/, '');
  const isCorrect =
    normalizeSentenceForCompare(assembled) === normalizeSentenceForCompare(expected);
  return { isCorrect, assembled, expected };
}

export function buildEnglishRoundQuestions(
  topicFilter: EnglishTopicFilter,
  mode: Exclude<EnglishGameMode, 'pair_match'>,
  count = 6,
  seed = 1
): EnglishQuizQuestion[] {
  const pool = getItemsForTopic(topicFilter);
  const shuffledPool = seededShuffle(pool, seed + 3);
  const selected = shuffledPool.slice(0, Math.min(count, shuffledPool.length));

  return selected.map((item, idx) => {
    const qSeed = seed * 31 + idx * 17 + 5;

    if (mode === 'vocab_speed') {
      const sameTopicDistractors = ENGLISH_TOPIC_ITEMS.filter(
        (other) => other.id !== item.id && other.topic === item.topic && other.meaningVi !== item.meaningVi
      );
      const otherTopicDistractors = ENGLISH_TOPIC_ITEMS.filter(
        (other) => other.id !== item.id && other.topic !== item.topic && other.meaningVi !== item.meaningVi
      );
      const distractorPool = seededShuffle(
        [...sameTopicDistractors, ...otherTopicDistractors],
        qSeed
      );
      const distractors: string[] = [];
      for (const d of distractorPool) {
        if (!distractors.includes(d.meaningVi)) {
          distractors.push(d.meaningVi);
        }
        if (distractors.length >= 3) break;
      }

      const options = seededShuffle([item.meaningVi, ...distractors], qSeed + 7);
      return {
        id: `q-${mode}-${item.id}-${idx}`,
        item,
        mode,
        promptTitle: item.word,
        promptSub: `${item.phonetic} · ${item.partOfSpeech} · ${item.level}`,
        options,
        correctAnswer: item.meaningVi,
      };
    }

    if (mode === 'context_cloze') {
      const sameTopicDistractors = ENGLISH_TOPIC_ITEMS.filter(
        (other) => other.id !== item.id && other.topic === item.topic && other.clozeAnswer !== item.clozeAnswer
      );
      const otherTopicDistractors = ENGLISH_TOPIC_ITEMS.filter(
        (other) => other.id !== item.id && other.topic !== item.topic && other.clozeAnswer !== item.clozeAnswer
      );
      const distractorPool = seededShuffle(
        [...sameTopicDistractors, ...otherTopicDistractors],
        qSeed
      );
      const distractors: string[] = [];
      for (const d of distractorPool) {
        if (!distractors.includes(d.clozeAnswer)) {
          distractors.push(d.clozeAnswer);
        }
        if (distractors.length >= 3) break;
      }

      const options = seededShuffle([item.clozeAnswer, ...distractors], qSeed + 11);
      return {
        id: `q-${mode}-${item.id}-${idx}`,
        item,
        mode,
        promptTitle: item.clozeSentence,
        promptSub: `Gợi ý: ${item.clozeHintVi} (${item.level})`,
        options,
        correctAnswer: item.clozeAnswer,
      };
    }

    // sentence_builder
    const targetTokens = tokenizeEnglishSentence(item.builderSentence);
    let shuffledTokens = seededShuffle(targetTokens, qSeed + 13);
    if (
      targetTokens.length > 2 &&
      shuffledTokens.join(' ') === targetTokens.join(' ')
    ) {
      shuffledTokens = [...shuffledTokens.slice(1), shuffledTokens[0]];
    }

    return {
      id: `q-${mode}-${item.id}-${idx}`,
      item,
      mode: 'sentence_builder',
      promptTitle: item.builderTranslationVi,
      promptSub: `Từ khóa trọng tâm: "${item.word}" (${item.phonetic})`,
      options: [],
      correctAnswer: targetTokens.join(' '),
      targetTokens,
      shuffledTokens,
    };
  });
}

export function buildTopicPairMatchDeck(
  topicFilter: EnglishTopicFilter,
  seed = 1
): EnglishPairCard[] {
  const pool = getItemsForTopic(topicFilter);
  const chosen = seededShuffle(pool, seed + 19).slice(0, 6);
  const rawCards: EnglishPairCard[] = [];

  for (const item of chosen) {
    rawCards.push({
      id: `pair-en-${item.id}`,
      pairId: item.id,
      side: 'en',
      text: item.word,
      phonetic: item.phonetic,
      topic: item.topic,
      matched: false,
    });
    rawCards.push({
      id: `pair-vi-${item.id}`,
      pairId: item.id,
      side: 'vi',
      text: item.meaningVi,
      topic: item.topic,
      matched: false,
    });
  }

  return seededShuffle(rawCards, seed + 29);
}

const CEFR_RANK: Record<CefrLevel, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  B2: 4,
  C1: 5,
  C2: 6,
};

export function buildLocalCognitiveAnalysis(params: {
  records: EnglishRoundAnswerRecord[];
  selectedTopic: EnglishTopicFilter;
  selectedMode: EnglishGameMode;
  userLevel?: CefrLevel;
  workoutsCount?: number;
}): CognitiveAnalysisReport {
  const { records, selectedTopic, selectedMode, userLevel = 'B1', workoutsCount = 0 } = params;

  const totalQuestions = records.length;
  const correctCount = records.filter((r) => r.isCorrect).length;
  const accuracyPct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const avgResponseMs =
    totalQuestions > 0
      ? Math.round(records.reduce((s, r) => s + Math.max(300, r.responseTimeMs), 0) / totalQuestions)
      : 0;

  const speedProfile: CognitiveAnalysisReport['speedProfile'] =
    avgResponseMs > 0 && avgResponseMs <= 4200
      ? 'Phản xạ Nhanh'
      : avgResponseMs <= 8500
        ? 'Nhịp độ Cân bằng'
        : 'Cần tăng Phản xạ';

  // Aggregate by topic
  const byTopic = new Map<EnglishGameTopicId, { total: number; correct: number; sumMs: number }>();
  for (const rec of records) {
    const curr = byTopic.get(rec.topic) ?? { total: 0, correct: 0, sumMs: 0 };
    curr.total += 1;
    if (rec.isCorrect) curr.correct += 1;
    curr.sumMs += Math.max(300, rec.responseTimeMs);
    byTopic.set(rec.topic, curr);
  }

  const topicMetaMap = new Map(ENGLISH_TOPIC_LIST.map((t) => [t.id, t]));
  const topicBreakdown: TopicMasterySummary[] = Array.from(byTopic.entries()).map(([topicId, stat]) => ({
    topicId,
    titleVi: topicMetaMap.get(topicId)?.titleVi ?? topicId,
    total: stat.total,
    correct: stat.correct,
    accuracyPct: Math.round((stat.correct / stat.total) * 100),
    avgMs: Math.round(stat.sumMs / stat.total),
  }));

  topicBreakdown.sort((a, b) => b.accuracyPct - a.accuracyPct || a.avgMs - b.avgMs);
  const strongestTopic = topicBreakdown[0] ?? null;
  const weakestTopic =
    topicBreakdown.length > 0 ? topicBreakdown[topicBreakdown.length - 1] : null;

  // Estimate CEFR readiness based on answered item difficulties & accuracy
  let weightedCefrSum = 0;
  let weightTotal = 0;
  for (const r of records) {
    const rank = CEFR_RANK[r.level] || 3;
    if (r.isCorrect) {
      weightedCefrSum += rank * 1.1;
      weightTotal += 1;
    } else {
      weightedCefrSum += Math.max(1, rank - 1) * 0.8;
      weightTotal += 1;
    }
  }
  const avgRank = weightTotal > 0 ? weightedCefrSum / weightTotal : CEFR_RANK[userLevel];
  const estimatedCefr: CefrLevel =
    avgRank >= 4.7
      ? 'C1'
      : avgRank >= 3.7
        ? 'B2'
        : avgRank >= 2.7
          ? 'B1'
          : avgRank >= 1.8
            ? 'A2'
            : 'A1';

  // Classify error patterns
  const mistakes = records.filter((r) => !r.isCorrect);
  const errorPatterns: string[] = [];
  if (mistakes.length === 0 && totalQuestions > 0) {
    errorPatterns.push('Độ chính xác tuyệt đối 100% — bạn sẵn sàng nâng cấp lên chủ đề C1 hoặc chế độ Ghép câu.');
  } else {
    if (mistakes.some((m) => m.mode === 'vocab_speed')) {
      errorPatterns.push('Nhầm sắc thái nghĩa từ vựng dưới áp lực thời gian; nên nghe lại IPA trước khi chọn.');
    }
    if (mistakes.some((m) => m.mode === 'context_cloze')) {
      errorPatterns.push('Chưa khớp ngữ cảnh & collocation trong câu thực tế; cần đọc kỹ từ khóa xung quanh chỗ trống.');
    }
    if (mistakes.some((m) => m.mode === 'sentence_builder')) {
      errorPatterns.push('Trật tự từ / cụm giới từ trong câu tiếng Anh bị đảo vị trí.');
    }
    if (mistakes.some((m) => m.mode === 'pair_match')) {
      errorPatterns.push('Trí nhớ thị giác ngắn hạn cần thêm lượt lặp lại ngắt quãng với các cặp từ mới.');
    }
    if (mistakes.some((m) => m.level === 'B2' || m.level === 'C1')) {
      errorPatterns.push('Các từ học thuật / thành ngữ cấp B2–C1 đòi hỏi ghi nhớ theo cụm từ thay vì từ đơn lẻ.');
    }
  }

  const fallbackNextTopic: EnglishGameTopicId =
    weakestTopic && weakestTopic.accuracyPct < 80
      ? weakestTopic.topicId
      : selectedTopic === 'all'
        ? 'idioms'
        : ENGLISH_TOPIC_LIST[
            (ENGLISH_TOPIC_LIST.findIndex((t) => t.id === selectedTopic) + 1) % ENGLISH_TOPIC_LIST.length
          ].id;

  const recommendedNextMode: EnglishGameMode =
    accuracyPct < 70
      ? 'pair_match'
      : selectedMode === 'vocab_speed'
        ? 'context_cloze'
        : selectedMode === 'context_cloze'
          ? 'sentence_builder'
          : 'vocab_speed';

  const crossModuleSynergyVi =
    selectedTopic === 'health' || workoutsCount > 0
      ? 'Kết hợp ngay 15 phút tập Thể chất 3D (module Tập luyện) cùng playlist từ vựng "Thể thao & Sức khỏe" để ghi nhớ theo phản xạ vận động.'
      : selectedTopic === 'food'
        ? 'Mở module Dinh dưỡng để đối chiếu trực tiếp các thuật ngữ macro (Dietary fiber, Whole grains) ngay trên bữa ăn hôm nay.'
        : 'Chuyển sang module Ngoại ngữ -> Nghe AI Phát âm hoặc bật nhạc Lo-fi Tập trung để ôn lại các từ vừa sai theo phương pháp lặp ngắt quãng.';

  return {
    totalQuestions,
    correctCount,
    accuracyPct,
    avgResponseMs,
    speedProfile,
    estimatedCefr,
    strongestTopic,
    weakestTopic,
    topicBreakdown,
    errorPatterns,
    recommendedNextTopic: fallbackNextTopic,
    recommendedNextMode,
    crossModuleSynergyVi,
  };
}

export function buildSpeechCoachFocus(records: EnglishRoundAnswerRecord[], topicFilter: EnglishTopicFilter): SpeechCoachFocus {
  const mistakes = records.filter((r) => !r.isCorrect);
  const sourceRecords =
    mistakes.length > 0
      ? mistakes
      : records.length > 0
        ? records.slice(0, 3)
        : getItemsForTopic(topicFilter)
            .slice(0, 3)
            .map((item) => ({
              itemId: item.id,
              word: item.word,
              phonetic: item.phonetic,
              topic: item.topic,
              level: item.level,
              mode: 'vocab_speed' as EnglishGameMode,
              promptText: item.word,
              userAnswer: '',
              correctAnswer: item.meaningVi,
              isCorrect: true,
              responseTimeMs: 2500,
              usageNoteVi: item.usageNoteVi,
            }));

  const uniqueMap = new Map<string, { word: string; phonetic: string; practiceTipVi: string }>();
  for (const r of sourceRecords) {
    if (!uniqueMap.has(r.word)) {
      uniqueMap.set(r.word, {
        word: r.word,
        phonetic: r.phonetic,
        practiceTipVi: r.usageNoteVi || 'Nhấn đúng trọng âm và đọc to 2 lần theo giọng mẫu AI.',
      });
    }
    if (uniqueMap.size >= 4) break;
  }

  const targetWords = Array.from(uniqueMap.values());
  return {
    ready: true,
    targetWords,
    drillInstructionVi:
      mistakes.length > 0
        ? `Tập trung phát âm chuẩn ${targetWords.length} từ bạn vừa nhầm để khóa chặt trí nhớ thính giác.`
        : `Nghe và đọc nhẩm theo ${targetWords.length} từ khóa trọng tâm để giữ phản xạ phát âm bản ngữ.`,
  };
}

export function buildCombinedVerdict(params: {
  cognitive: CognitiveAnalysisReport;
  geminiOk: boolean;
  claudeOk: boolean;
}): string {
  const { cognitive, geminiOk, claudeOk } = params;
  const activeEngines = [
    'Động cơ Nhận thức Cục bộ',
    geminiOk ? 'Gemini Diagnostic Coach' : null,
    claudeOk ? 'Claude Nuance Strategist' : null,
    'AI Speech Coach (TTS)',
  ].filter(Boolean);

  return `Đã tổng hợp ${activeEngines.length} hệ thống (${activeEngines.join(' + ')}): Độ chính xác ${cognitive.accuracyPct}% (${cognitive.correctCount}/${cognitive.totalQuestions}), tốc độ trung bình ${cognitive.avgResponseMs}ms (${cognitive.speedProfile}), năng lực ước tính CEFR ${cognitive.estimatedCefr}. Gợi ý bước kế tiếp: Chủ đề "${ENGLISH_TOPIC_LIST.find((t) => t.id === cognitive.recommendedNextTopic)?.titleVi ?? cognitive.recommendedNextTopic}" ở chế độ "${ENGLISH_GAME_MODES.find((m) => m.id === cognitive.recommendedNextMode)?.labelVi ?? cognitive.recommendedNextMode}".`;
}
