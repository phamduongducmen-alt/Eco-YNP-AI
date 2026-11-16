import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeLevelFromXp,
  createMemoryDeck,
  evaluateLanguagePlacement,
  evaluateRhythmHit,
  generateKidChallengeWave,
  generateLogicChallenge,
  generateMathChallenge,
  generateRhythmChart,
  generateStroopRound,
  RHYTHM_LANES,
  STROOP_COLORS,
} from './gameEngine';

test('computeLevelFromXp calculates level and progress percentage accurately', () => {
  assert.deepEqual(computeLevelFromXp(0), {
    level: 1,
    currentLevelXp: 0,
    nextLevelXp: 250,
    progressPct: 0,
  });
  assert.deepEqual(computeLevelFromXp(375), {
    level: 2,
    currentLevelXp: 125,
    nextLevelXp: 250,
    progressPct: 50,
  });
});

test('createMemoryDeck returns 12 cards forming 6 exact pairs', () => {
  const deck = createMemoryDeck(7);
  assert.equal(deck.length, 12);
  const counts = new Map<string, number>();
  for (const card of deck) {
    counts.set(card.pairId, (counts.get(card.pairId) || 0) + 1);
  }
  assert.equal(counts.size, 6);
  for (const count of counts.values()) {
    assert.equal(count, 2);
  }
});

test('math and logic generators produce valid answer among options', () => {
  const math = generateMathChallenge(2);
  assert.equal(math.options.length, 4);
  assert.equal(math.options.includes(math.answer), true);

  const logic = generateLogicChallenge(0);
  assert.equal(logic.answer, 21);
  assert.equal(logic.options.includes(logic.answer), true);
});

test('generateKidChallengeWave returns 4 stars with exactly 1 correct answer for math and vocab', () => {
  const mathWave = generateKidChallengeWave('math', 2, 0.2);
  assert.equal(mathWave.kind, 'math');
  assert.equal(mathWave.stars.length, 4);
  assert.equal(mathWave.stars.filter((s) => s.isCorrect).length, 1);

  const vocabWave = generateKidChallengeWave('vocab', 1, 0.8);
  assert.equal(vocabWave.kind, 'vocab');
  assert.equal(vocabWave.stars.length, 4);
  assert.equal(vocabWave.stars.filter((s) => s.isCorrect).length, 1);
});

test('evaluateLanguagePlacement maps score percentage to CEFR level', () => {
  assert.equal(evaluateLanguagePlacement(6, 6).level, 'C1');
  assert.equal(evaluateLanguagePlacement(4, 6).level, 'B1');
  assert.equal(evaluateLanguagePlacement(1, 6).level, 'A1');
});

test('generateRhythmChart and evaluateRhythmHit enforce lane bounds and timing windows', () => {
  assert.equal(RHYTHM_LANES.length, 4);
  const chart = generateRhythmChart(120, 12000);
  assert.ok(chart.length >= 15);
  for (let i = 0; i < chart.length; i++) {
    assert.ok(chart[i].lane >= 0 && chart[i].lane <= 3);
    assert.equal(chart[i].hitState, 'pending');
    if (i > 0) {
      assert.ok(chart[i].targetTimeMs > chart[i - 1].targetTimeMs);
    }
  }

  assert.deepEqual(evaluateRhythmHit(0), { grade: 'perfect', points: 100 });
  assert.deepEqual(evaluateRhythmHit(-115), { grade: 'perfect', points: 100 });
  assert.deepEqual(evaluateRhythmHit(180), { grade: 'good', points: 50 });
  assert.deepEqual(evaluateRhythmHit(320), { grade: 'miss', points: 0 });
});

test('generateStroopRound generates valid Stroop ink/meaning prompts and matching options', () => {
  assert.equal(STROOP_COLORS.length, 5);
  const inkRound = generateStroopRound(0, 0.42);
  assert.equal(inkRound.mode, 'ink_color');
  assert.ok(inkRound.options.some((c) => c.id === inkRound.correctColorId));

  const meaningRound = generateStroopRound(2, 0.42);
  assert.equal(meaningRound.mode, 'word_meaning');
  assert.ok(meaningRound.options.some((c) => c.id === meaningRound.correctColorId));
});
