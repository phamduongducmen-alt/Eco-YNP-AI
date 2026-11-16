import test from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISE_LIBRARY } from '../data/exercises';
import {
  CONVERSATION_PHRASEBOOK,
  ENGLISH_PLACEMENT_QUIZ,
  GLOBAL_LANGUAGES,
  VOCAB_FLASHCARDS,
} from '../data/languages';
import {
  MUSIC_GENRE_ORDER,
  MUSIC_TRACKS,
  filterTracksByGenre,
  getDefaultTrackForGenre,
  getRecommendedGenreForModule,
} from '../data/musicTracks';
import type { AppModuleId } from '../types/lifeworld';

test('Every home fitness exercise covers diverse sports with unique photos, clean units, and YouTube guides', () => {
  assert.ok(EXERCISE_LIBRARY.length >= 20);
  const seenImages = new Set<string>();
  const shorthandUnitRegex = /\b\d+(?:s|p|cm|kg|m)\b/i;

  for (const ex of EXERCISE_LIBRARY) {
    assert.ok(ex.guideImage.startsWith('/src/assets/images/'), `Expected real asset for ${ex.id}`);
    assert.ok(!seenImages.has(ex.guideImage), `Duplicate image ${ex.guideImage} on ${ex.id}`);
    seenImages.add(ex.guideImage);
    assert.ok(ex.steps.length >= 4, `Expected rich steps for ${ex.id}`);
    assert.ok(ex.youtubeVideoId && ex.youtubeVideoId.length >= 8, `Missing youtubeVideoId for ${ex.id}`);
    assert.ok(ex.youtubeTitle.length > 0, `Missing youtubeTitle for ${ex.id}`);
    assert.ok(ex.youtubeChannel.length > 0, `Missing youtubeChannel for ${ex.id}`);

    assert.equal(shorthandUnitRegex.test(ex.repsOrHold), false, `Shorthand unit in repsOrHold for ${ex.id}: ${ex.repsOrHold}`);
    assert.equal(shorthandUnitRegex.test(ex.equipment), false, `Shorthand unit in equipment for ${ex.id}: ${ex.equipment}`);
    for (const step of ex.steps) {
      assert.equal(shorthandUnitRegex.test(step), false, `Shorthand unit in step for ${ex.id}: ${step}`);
    }
  }

  assert.ok(EXERCISE_LIBRARY.some((e) => e.categories.includes('gym_strength')));
  assert.ok(EXERCISE_LIBRARY.some((e) => e.categories.includes('calisthenics')));
  assert.ok(EXERCISE_LIBRARY.some((e) => e.categories.includes('football_agility')));
  assert.ok(EXERCISE_LIBRARY.some((e) => e.categories.includes('running_boxing')));
});

test('Music track catalog covers all 8 genres with 24+ tracks for all modules', () => {
  assert.ok(MUSIC_GENRE_ORDER.length >= 8);
  assert.ok(MUSIC_TRACKS.length >= 24);
  for (const genre of MUSIC_GENRE_ORDER) {
    const filtered = filterTracksByGenre(genre);
    assert.ok(filtered.length >= 2, `Genre ${genre} should have at least 2 tracks`);
    const defTrack = getDefaultTrackForGenre(genre);
    assert.equal(defTrack.genre, genre);
    assert.ok(defTrack.bpm >= 55 && defTrack.bpm <= 160);
  }
  assert.equal(filterTracksByGenre('all').length, MUSIC_TRACKS.length);

  const modules: AppModuleId[] = [
    'dashboard',
    'timer',
    'fitness',
    'nutrition',
    'languages',
    'games',
    'meditation',
    'assistant',
  ];
  for (const mod of modules) {
    const rec = getRecommendedGenreForModule(mod);
    assert.ok(MUSIC_GENRE_ORDER.includes(rec));
  }
  assert.equal(getRecommendedGenreForModule('fitness'), 'phonk');
  assert.equal(getRecommendedGenreForModule('languages'), 'lofi');
  assert.equal(getRecommendedGenreForModule('meditation'), 'zen');
});

test('Language hub covers all 20 languages with flashcards, phrasebook, and placement questions', () => {
  assert.equal(GLOBAL_LANGUAGES.length, 20);
  assert.ok(ENGLISH_PLACEMENT_QUIZ.length >= 10);

  for (const lang of GLOBAL_LANGUAGES) {
    const cards = VOCAB_FLASHCARDS.filter((c) => c.languageCode === lang.code);
    const phrases = CONVERSATION_PHRASEBOOK.filter((p) => p.languageCode === lang.code);
    assert.ok(cards.length >= 2, `Missing flashcards for ${lang.code}`);
    assert.ok(phrases.length >= 1, `Missing phrasebook scenarios for ${lang.code}`);
  }

  const enCards = VOCAB_FLASHCARDS.filter((c) => c.languageCode === 'en');
  const enTopics = new Set(enCards.map((c) => c.topic));
  assert.ok(enCards.length >= 15);
  assert.ok(enTopics.size >= 6);
});
