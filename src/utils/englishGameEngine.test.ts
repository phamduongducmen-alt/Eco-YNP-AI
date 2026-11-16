import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombinedVerdict,
  buildEnglishRoundQuestions,
  buildLocalCognitiveAnalysis,
  buildSpeechCoachFocus,
  buildTopicPairMatchDeck,
  getEnglishTopics,
  getItemsForTopic,
  validateSentenceBuilder,
  type EnglishRoundAnswerRecord,
} from './englishGameEngine';

describe('englishGameEngine', () => {
  it('provides 9 distinct English topics with 6 curated items each (54 total)', () => {
    const topics = getEnglishTopics();
    assert.equal(topics.length, 9);
    const allItems = getItemsForTopic('all');
    assert.equal(allItems.length, 54);
    for (const topic of topics) {
      assert.equal(getItemsForTopic(topic.id).length, 6, `Topic ${topic.id} should have 6 items`);
    }
  });

  it('builds valid vocab_speed and context_cloze rounds with 4 unique options containing the answer', () => {
    for (const mode of ['vocab_speed', 'context_cloze'] as const) {
      const qs = buildEnglishRoundQuestions('health', mode, 6, 42);
      assert.equal(qs.length, 6);
      for (const q of qs) {
        assert.equal(q.options.length, 4);
        assert.equal(new Set(q.options).size, 4, 'Options must all be unique');
        assert.ok(q.options.includes(q.correctAnswer), 'Correct answer must be in options');
      }
    }
  });

  it('builds sentence_builder rounds with shuffled tokens matching target words', () => {
    const qs = buildEnglishRoundQuestions('tech', 'sentence_builder', 6, 7);
    assert.equal(qs.length, 6);
    for (const q of qs) {
      assert.ok(q.targetTokens && q.targetTokens.length >= 4);
      assert.ok(q.shuffledTokens && q.shuffledTokens.length === q.targetTokens.length);
      assert.deepEqual([...q.shuffledTokens].sort(), [...q.targetTokens].sort());
      const valid = validateSentenceBuilder(q.targetTokens, q.item.builderSentence);
      assert.equal(valid.isCorrect, true);
    }
  });

  it('validates sentence builder ordering accurately', () => {
    const ok = validateSentenceBuilder(
      ['Daily', 'yoga', 'improves', 'mobility'],
      'daily yoga improves mobility.'
    );
    assert.equal(ok.isCorrect, true);

    const bad = validateSentenceBuilder(
      ['Yoga', 'daily', 'mobility', 'improves'],
      'Daily yoga improves mobility.'
    );
    assert.equal(bad.isCorrect, false);
  });

  it('builds 12-card (6 en + 6 vi) pair match decks for every topic', () => {
    const deck = buildTopicPairMatchDeck('travel', 11);
    assert.equal(deck.length, 12);
    const enCards = deck.filter((c) => c.side === 'en');
    const viCards = deck.filter((c) => c.side === 'vi');
    assert.equal(enCards.length, 6);
    assert.equal(viCards.length, 6);
    assert.deepEqual(
      enCards.map((c) => c.pairId).sort(),
      viCards.map((c) => c.pairId).sort()
    );
  });

  it('computes deterministic cognitive telemetry, error patterns, speech focus, and combined verdict', () => {
    const records: EnglishRoundAnswerRecord[] = [
      {
        itemId: 'en-health-1',
        word: 'hydration',
        phonetic: '/haɪˈdreɪʃən/',
        topic: 'health',
        level: 'A2',
        mode: 'vocab_speed',
        promptText: 'hydration',
        userAnswer: 'sự cấp nước và giữ ẩm cơ thể',
        correctAnswer: 'sự cấp nước và giữ ẩm cơ thể',
        isCorrect: true,
        responseTimeMs: 2100,
        usageNoteVi: 'well-hydrated',
      },
      {
        itemId: 'en-tech-4',
        word: 'prompt engineering',
        phonetic: '/prɒmpt ˌendʒɪˈnɪərɪŋ/',
        topic: 'tech',
        level: 'C1',
        mode: 'context_cloze',
        promptText: 'Clear examples...',
        userAnswer: 'latency',
        correctAnswer: 'prompt engineering',
        isCorrect: false,
        responseTimeMs: 5200,
        usageNoteVi: 'structuring AI instructions',
      },
      {
        itemId: 'en-tech-1',
        word: 'encryption',
        phonetic: '/ɪnˈkrɪpʃən/',
        topic: 'tech',
        level: 'B1',
        mode: 'context_cloze',
        promptText: 'Private mood journals...',
        userAnswer: 'encryption',
        correctAnswer: 'encryption',
        isCorrect: true,
        responseTimeMs: 3100,
        usageNoteVi: 'encrypt / decrypt',
      },
    ];

    const report = buildLocalCognitiveAnalysis({
      records,
      selectedTopic: 'all',
      selectedMode: 'context_cloze',
      userLevel: 'B1',
      workoutsCount: 2,
    });

    assert.equal(report.totalQuestions, 3);
    assert.equal(report.correctCount, 2);
    assert.equal(report.accuracyPct, 67);
    assert.equal(report.speedProfile, 'Phản xạ Nhanh');
    assert.equal(report.strongestTopic?.topicId, 'health');
    assert.equal(report.weakestTopic?.topicId, 'tech');
    assert.ok(report.errorPatterns.length >= 1);

    const speech = buildSpeechCoachFocus(records, 'all');
    assert.equal(speech.targetWords[0].word, 'prompt engineering');

    const verdict = buildCombinedVerdict({
      cognitive: report,
      geminiOk: true,
      claudeOk: true,
    });
    assert.match(verdict, /Gemini Diagnostic Coach/);
    assert.match(verdict, /Claude Nuance Strategist/);
    assert.match(verdict, /67%/);
  });
});
