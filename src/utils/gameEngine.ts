import type { CefrLevel } from '../types/lifeworld';

export interface MemoryCard {
  id: string;
  pairId: string;
  label: string;
  symbol: string;
  flipped: boolean;
  matched: boolean;
}

export interface MathChallenge {
  question: string;
  answer: number;
  options: number[];
}

export interface LogicChallenge {
  prompt: string;
  sequence: (number | string)[];
  answer: number;
  options: number[];
  explanation: string;
}

export type KidChallengeMode = 'math' | 'vocab' | 'mix';

export interface KidStarOption {
  label: string;
  isCorrect: boolean;
  isBonus?: boolean;
}

export interface KidChallengeWave {
  kind: 'math' | 'vocab';
  promptText: string;
  hintText: string;
  correctLabel: string;
  stars: KidStarOption[];
}

const KID_VOCAB_BANK: Array<{ vi: string; en: string; emoji: string }> = [
  { vi: 'Mặt trời', en: 'Sun', emoji: '☀️' },
  { vi: 'Mặt trăng', en: 'Moon', emoji: '🌙' },
  { vi: 'Ngôi sao', en: 'Star', emoji: '⭐' },
  { vi: 'Quả táo', en: 'Apple', emoji: '🍎' },
  { vi: 'Cây xanh', en: 'Tree', emoji: '🌳' },
  { vi: 'Con mèo', en: 'Cat', emoji: '🐱' },
  { vi: 'Con chó', en: 'Dog', emoji: '🐶' },
  { vi: 'Nước uống', en: 'Water', emoji: '💧' },
  { vi: 'Quyển sách', en: 'Book', emoji: '📘' },
  { vi: 'Bông hoa', en: 'Flower', emoji: '🌸' },
  { vi: 'Đám mây', en: 'Cloud', emoji: '☁️' },
  { vi: 'Cầu vồng', en: 'Rainbow', emoji: '🌈' },
  { vi: 'Trái tim', en: 'Heart', emoji: '❤️' },
  { vi: 'Bút chì', en: 'Pencil', emoji: '✏️' },
];

export function generateKidChallengeWave(mode: KidChallengeMode, level: number, seed = Math.random()): KidChallengeWave {
  const useVocab = mode === 'vocab' || (mode === 'mix' && seed >= 0.5);

  if (useVocab) {
    const idx = Math.floor((seed * 997) % KID_VOCAB_BANK.length);
    const target = KID_VOCAB_BANK[Math.abs(idx) % KID_VOCAB_BANK.length];
    const distractors: string[] = [];
    for (let offset = 1; distractors.length < 3; offset++) {
      const cand = KID_VOCAB_BANK[(idx + offset * 3) % KID_VOCAB_BANK.length];
      if (cand.en !== target.en && !distractors.includes(cand.en)) {
        distractors.push(cand.en);
      }
    }
    const rawStars: KidStarOption[] = [
      { label: target.en, isCorrect: true },
      ...distractors.map((label) => ({ label, isCorrect: false })),
    ];
    // Deterministic or random shuffle
    for (let i = rawStars.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = rawStars[i];
      rawStars[i] = rawStars[j];
      rawStars[j] = tmp;
    }
    return {
      kind: 'vocab',
      promptText: `${target.emoji} "${target.vi}" tiếng Anh là gì?`,
      hintText: `Hứng ngôi sao có chữ "${target.en}"`,
      correctLabel: target.en,
      stars: rawStars,
    };
  }

  // Kid-friendly math scaled gently by arcade level
  const cap = Math.min(25, 6 + level * 3);
  const a = Math.floor(Math.random() * cap) + 1;
  const b = Math.floor(Math.random() * Math.min(12, cap)) + 1;
  const allowMultiply = level >= 3 && Math.random() > 0.65;
  const useSubtraction = !allowMultiply && Math.random() > 0.55;

  let promptText = '';
  let answer = 0;
  if (allowMultiply) {
    const m1 = Math.min(9, a % 8 + 2);
    const m2 = Math.min(9, b % 6 + 2);
    promptText = `${m1} × ${m2} = ?`;
    answer = m1 * m2;
  } else if (useSubtraction) {
    const big = Math.max(a, b) + 2;
    const small = Math.min(a, b);
    promptText = `${big} - ${small} = ?`;
    answer = big - small;
  } else {
    promptText = `${a} + ${b} = ?`;
    answer = a + b;
  }

  const options = new Set<number>([answer]);
  let guard = 0;
  while (options.size < 4 && guard < 30) {
    guard++;
    const delta = Math.floor(Math.random() * 7) - 3;
    if (delta !== 0 && answer + delta >= 0) {
      options.add(answer + delta);
    }
  }
  while (options.size < 4) {
    options.add(answer + options.size);
  }

  const stars: KidStarOption[] = Array.from(options).map((val) => ({
    label: String(val),
    isCorrect: val === answer,
  }));
  for (let i = stars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = stars[i];
    stars[i] = stars[j];
    stars[j] = tmp;
  }

  return {
    kind: 'math',
    promptText,
    hintText: `Đáp án đúng là ${answer}`,
    correctLabel: String(answer),
    stars,
  };
}

export function computeLevelFromXp(xp: number): {
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
} {
  const safeXp = Math.max(0, Math.floor(xp));
  const xpPerLevel = 250;
  const level = Math.floor(safeXp / xpPerLevel) + 1;
  const currentLevelXp = safeXp % xpPerLevel;
  const progressPct = Math.round((currentLevelXp / xpPerLevel) * 100);
  return {
    level,
    currentLevelXp,
    nextLevelXp: xpPerLevel,
    progressPct,
  };
}

export function createMemoryDeck(seedOffset = 0): MemoryCard[] {
  const pairs = [
    { pairId: 'yoga', label: 'Yoga', symbol: '🧘' },
    { pairId: 'water', label: 'Nước', symbol: '💧' },
    { pairId: 'apple', label: 'Dinh dưỡng', symbol: '🍎' },
    { pairId: 'brain', label: 'Trí nhớ', symbol: '🧠' },
    { pairId: 'globe', label: 'Ngôn ngữ', symbol: '🌐' },
    { pairId: 'sun', label: 'Năng lượng', symbol: '☀️' },
  ];

  const cards: MemoryCard[] = [];
  pairs.forEach((p, idx) => {
    cards.push({
      id: `${p.pairId}-a-${idx}`,
      pairId: p.pairId,
      label: p.label,
      symbol: p.symbol,
      flipped: false,
      matched: false,
    });
    cards.push({
      id: `${p.pairId}-b-${idx}`,
      pairId: p.pairId,
      label: p.label,
      symbol: p.symbol,
      flipped: false,
      matched: false,
    });
  });

  // Deterministic Fisher-Yates shuffle when seedOffset is provided or random otherwise
  for (let i = cards.length - 1; i > 0; i--) {
    const pseudo = seedOffset > 0 ? ((seedOffset * (i + 7) * 31) % (i + 1)) : Math.floor(Math.random() * (i + 1));
    const j = Math.abs(pseudo) % (i + 1);
    const tmp = cards[i];
    cards[i] = cards[j];
    cards[j] = tmp;
  }
  return cards;
}

export function generateMathChallenge(difficulty: 1 | 2 | 3): MathChallenge {
  const max = difficulty === 1 ? 15 : difficulty === 2 ? 35 : 80;
  const a = Math.floor(Math.random() * max) + 3;
  const b = Math.floor(Math.random() * max) + 2;
  const opIndex = Math.floor(Math.random() * 3);

  let question = '';
  let answer = 0;
  if (opIndex === 0) {
    question = `${a} + ${b} = ?`;
    answer = a + b;
  } else if (opIndex === 1) {
    const big = Math.max(a, b) + 5;
    const small = Math.min(a, b);
    question = `${big} - ${small} = ?`;
    answer = big - small;
  } else {
    const m1 = Math.min(a, 14) + 2;
    const m2 = Math.min(b, 12) + 2;
    question = `${m1} × ${m2} = ?`;
    answer = m1 * m2;
  }

  const optionsSet = new Set<number>([answer]);
  while (optionsSet.size < 4) {
    const offset = Math.floor(Math.random() * 9) - 4;
    if (offset !== 0 && answer + offset >= 0) {
      optionsSet.add(answer + offset);
    }
  }
  const options = Array.from(optionsSet).sort((x, y) => x - y);
  return { question, answer, options };
}

export function generateLogicChallenge(index: number): LogicChallenge {
  const bank: LogicChallenge[] = [
    {
      prompt: 'Tìm số tiếp theo trong dãy Fibonacci biến thể:',
      sequence: [2, 3, 5, 8, 13, '?'],
      answer: 21,
      options: [18, 20, 21, 24],
      explanation: 'Mỗi số bằng tổng hai số liền trước: 8 + 13 = 21.',
    },
    {
      prompt: 'Tìm quy luật tăng dần của cấp số:',
      sequence: [4, 7, 12, 19, 28, '?'],
      answer: 39,
      options: [36, 37, 39, 41],
      explanation: 'Hiệu tăng thêm +2 mỗi bước (+3, +5, +7, +9, +11) → 28 + 11 = 39.',
    },
    {
      prompt: 'Tìm số còn thiếu theo quy luật nhân:',
      sequence: [3, 6, 12, 24, '?'],
      answer: 48,
      options: [36, 42, 48, 54],
      explanation: 'Mỗi số gấp đôi số trước đó: 24 × 2 = 48.',
    },
    {
      prompt: 'Tìm số tiếp theo trong chuỗi bình phương:',
      sequence: [1, 4, 9, 16, 25, '?'],
      answer: 36,
      options: [30, 34, 36, 49],
      explanation: 'Dãy số là 1², 2², 3², 4², 5², tiếp theo là 6² = 36.',
    },
    {
      prompt: 'Giải mã chuỗi xen kẽ:',
      sequence: [10, 15, 13, 18, 16, '?'],
      answer: 21,
      options: [14, 19, 21, 23],
      explanation: 'Quy luật xen kẽ: +5 rồi -2 (+5, -2, +5, -2, +5) → 16 + 5 = 21.',
    },
  ];
  return bank[Math.abs(index) % bank.length];
}

export function evaluateLanguagePlacement(correctCount: number, totalQuestions: number): {
  level: CefrLevel;
  scorePct: number;
  recommendation: string;
} {
  const safeTotal = Math.max(1, totalQuestions);
  const scorePct = Math.round((Math.max(0, Math.min(safeTotal, correctCount)) / safeTotal) * 100);
  if (scorePct >= 90) {
    return {
      level: 'C1',
      scorePct,
      recommendation: 'Nền tảng vững chắc. Hãy luyện hội thoại AI chuyên sâu và đọc bài phân tích dài.',
    };
  }
  if (scorePct >= 75) {
    return {
      level: 'B2',
      scorePct,
      recommendation: 'Giao tiếp tự tin. Tập trung tinh chỉnh phát âm và sắc thái ngữ pháp tự nhiên.',
    };
  }
  if (scorePct >= 55) {
    return {
      level: 'B1',
      scorePct,
      recommendation: 'Trung cấp ổn định. Luyện phản xạ hội thoại theo chủ đề công việc và sức khỏe.',
    };
  }
  if (scorePct >= 35) {
    return {
      level: 'A2',
      scorePct,
      recommendation: 'Sơ trung cấp. Ôn tập Flashcards mỗi ngày 15 từ và mẫu câu giao tiếp cơ bản.',
    };
  }
  return {
    level: 'A1',
    scorePct,
    recommendation: 'Mới bắt đầu. Bắt đầu từ bộ từ vựng sinh hoạt hằng ngày và nghe giọng đọc chuẩn.',
  };
}

// ===================== RHYTHM BEAT CHALLENGE =====================
export interface RhythmCue {
  id: string;
  lane: 0 | 1 | 2 | 3;
  targetTimeMs: number;
  actionLabel: string;
  hitState: 'pending' | 'perfect' | 'good' | 'miss';
}

export const RHYTHM_LANES = [
  { lane: 0 as const, keyChar: 'D', label: 'Squat', color: '#ff6b1a' },
  { lane: 1 as const, keyChar: 'F', label: 'Jab', color: '#f59e0b' },
  { lane: 2 as const, keyChar: 'J', label: 'Jump', color: '#38bdf8' },
  { lane: 3 as const, keyChar: 'K', label: 'Core', color: '#10b981' },
];

export function generateRhythmChart(bpm: number, durationMs: number): RhythmCue[] {
  const safeBpm = Math.max(70, Math.min(180, bpm));
  const beatMs = Math.round(60000 / safeBpm);
  const cues: RhythmCue[] = [];
  let idx = 0;

  for (let t = 1400; t <= durationMs - 600; t += beatMs) {
    const lane = ((idx * 3 + (idx % 2 === 0 ? 1 : 0)) % 4) as 0 | 1 | 2 | 3;
    cues.push({
      id: `cue-${idx}`,
      lane,
      targetTimeMs: t,
      actionLabel: RHYTHM_LANES[lane].label,
      hitState: 'pending',
    });
    idx += 1;
  }
  return cues;
}

export function evaluateRhythmHit(deltaMs: number): {
  grade: 'perfect' | 'good' | 'miss';
  points: number;
} {
  const absDelta = Math.abs(deltaMs);
  if (absDelta <= 115) {
    return { grade: 'perfect', points: 100 };
  }
  if (absDelta <= 230) {
    return { grade: 'good', points: 50 };
  }
  return { grade: 'miss', points: 0 };
}

// ===================== STROOP COGNITIVE ARENA =====================
export interface StroopColorDef {
  id: 'red' | 'emerald' | 'sky' | 'amber' | 'violet';
  labelVi: string;
  hex: string;
}

export const STROOP_COLORS: StroopColorDef[] = [
  { id: 'red', labelVi: 'ĐỎ', hex: '#ef4444' },
  { id: 'emerald', labelVi: 'XANH LÁ', hex: '#10b981' },
  { id: 'sky', labelVi: 'XANH DƯƠNG', hex: '#38bdf8' },
  { id: 'amber', labelVi: 'VÀNG CAM', hex: '#f59e0b' },
  { id: 'violet', labelVi: 'TÍM', hex: '#a855f7' },
];

export interface StroopRound {
  mode: 'ink_color' | 'word_meaning';
  promptVi: string;
  wordText: string;
  inkHex: string;
  correctColorId: StroopColorDef['id'];
  options: StroopColorDef[];
}

export function generateStroopRound(roundIndex: number, randomSeed = Math.random()): StroopRound {
  const n = STROOP_COLORS.length;
  const wordIdx = Math.abs(roundIndex + Math.floor(randomSeed * 17)) % n;
  // Offset ink index so word text and ink color usually clash
  const inkOffset = 1 + (Math.floor(randomSeed * 100) % (n - 1));
  const inkIdx = (wordIdx + inkOffset) % n;

  const wordColor = STROOP_COLORS[wordIdx];
  const inkColor = STROOP_COLORS[inkIdx];
  const mode: 'ink_color' | 'word_meaning' = roundIndex % 3 === 2 ? 'word_meaning' : 'ink_color';
  const target = mode === 'ink_color' ? inkColor : wordColor;

  return {
    mode,
    promptVi:
      mode === 'ink_color'
        ? 'Chọn ĐÚNG MÀU MỰC đang hiển thị (bỏ qua nghĩa chữ):'
        : 'Chọn ĐÚNG NGHĨA CỦA TỪ (bỏ qua màu mực):',
    wordText: wordColor.labelVi,
    inkHex: inkColor.hex,
    correctColorId: target.id,
    options: STROOP_COLORS,
  };
}

