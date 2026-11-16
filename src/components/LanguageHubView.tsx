import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Globe2,
  Headphones,
  Languages,
  MessageCircle,
  MessageSquare,
  Mic,
  Music2,
  RefreshCw,
  Volume2,
} from 'lucide-react';
import {
  CONVERSATION_PHRASEBOOK,
  ENGLISH_PLACEMENT_QUIZ,
  GLOBAL_LANGUAGES,
  LANGUAGE_TOPIC_LABELS,
  PHRASE_CATEGORY_LABELS,
  VOCAB_FLASHCARDS,
} from '../data/languages';
import { AI_COUNTRY_VOICES, getCountryVoiceProfile } from '../data/voices';
import type {
  CefrLevel,
  LanguageTopicId,
  PhraseCategoryId,
  VoiceGender,
} from '../types/lifeworld';
import { evaluateLanguagePlacement } from '../utils/gameEngine';
import { speakWithAiVoice } from '../utils/voiceEngine';

interface LanguageHubViewProps {
  targetLanguageCode: string;
  userLevel: CefrLevel;
  lessonsCompleted: number;
  aiVoiceName: 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';
  aiVoiceGender?: VoiceGender;
  vietnameseRegion?: 'north' | 'south';
  isStudyMusicPlaying?: boolean;
  onPlayStudyMusic?: () => void;
  onChangeTargetLanguage: (code: string) => void;
  onChangeVoiceGender?: (gender: VoiceGender) => void;
  onUpdateLevel: (level: CefrLevel) => void;
  onCompleteLesson: (xpReward: number) => void;
  onOpenEnglishGameArena?: () => void;
}

export const LanguageHubView: React.FC<LanguageHubViewProps> = ({
  targetLanguageCode,
  userLevel,
  lessonsCompleted,
  aiVoiceName,
  aiVoiceGender = 'female',
  vietnameseRegion = 'north',
  isStudyMusicPlaying = false,
  onPlayStudyMusic,
  onChangeTargetLanguage,
  onChangeVoiceGender,
  onUpdateLevel,
  onCompleteLesson,
  onOpenEnglishGameArena,
}) => {
  const [subTab, setSubTab] = useState<'flashcards' | 'phrases' | 'practice' | 'ai_tutor' | 'placement'>('flashcards');
  const [selectedTopic, setSelectedTopic] = useState<'all' | LanguageTopicId>('all');
  const [selectedPhraseCat, setSelectedPhraseCat] = useState<'all' | PhraseCategoryId>('all');
  const [cardIndex, setCardIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [speakingText, setSpeakingText] = useState<string | null>(null);
  const [localGender, setLocalGender] = useState<VoiceGender>(aiVoiceGender);

  // Listening & Vocabulary Quick Practice state
  const [practiceIdx, setPracticeIdx] = useState(0);
  const [practiceSelected, setPracticeSelected] = useState<number | null>(null);
  const [practiceStreak, setPracticeStreak] = useState(0);

  // AI Tutor / Translator / Grammar / Dictionary state
  const [tutorMode, setTutorMode] = useState<'chat' | 'grammar' | 'translate' | 'dictionary'>('chat');
  const [tutorInput, setTutorInput] = useState('');
  const [translateTarget, setTranslateTarget] = useState('Tiếng Việt');
  const [tutorOutput, setTutorOutput] = useState<string | null>(null);
  const [tutorError, setTutorError] = useState<string | null>(null);
  const [tutorLoading, setTutorLoading] = useState(false);
  const [listening, setListening] = useState(false);

  // Placement Quiz state
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const selectedLang =
    GLOBAL_LANGUAGES.find((l) => l.code === targetLanguageCode) || GLOBAL_LANGUAGES[0];

  const langCardsAll = VOCAB_FLASHCARDS.filter((c) => c.languageCode === selectedLang.code);
  const filteredCards =
    selectedTopic === 'all'
      ? langCardsAll
      : langCardsAll.filter((c) => c.topic === selectedTopic);
  const activeCards = filteredCards.length > 0 ? filteredCards : langCardsAll;
  const currentCard = activeCards[cardIndex % activeCards.length];

  const langPhrasesAll = CONVERSATION_PHRASEBOOK.filter((p) => p.languageCode === selectedLang.code);
  const filteredPhrases =
    selectedPhraseCat === 'all'
      ? langPhrasesAll
      : langPhrasesAll.filter((p) => p.category === selectedPhraseCat);
  const activePhrases = filteredPhrases.length > 0 ? filteredPhrases : langPhrasesAll;

  // Dynamic Listening & Meaning Practice Question built from all flashcards
  const practiceQuestion = useMemo(() => {
    const targetPool = langCardsAll.length > 0 ? langCardsAll : VOCAB_FLASHCARDS;
    const item = targetPool[practiceIdx % targetPool.length];
    const distractors = VOCAB_FLASHCARDS.filter(
      (c) => c.id !== item.id && c.meaningVi !== item.meaningVi
    ).slice(practiceIdx % 5, (practiceIdx % 5) + 3);

    const options = [
      { label: item.meaningVi, correct: true },
      ...distractors.map((d) => ({ label: d.meaningVi, correct: false })),
    ];
    // Deterministic rotate based on practiceIdx so answer isn't always index 0
    const shift = practiceIdx % options.length;
    const rotated = [...options.slice(shift), ...options.slice(0, shift)];
    return { item, options: rotated };
  }, [langCardsAll, practiceIdx]);

  const selectedVoiceProfile = getCountryVoiceProfile(selectedLang.code);

  const speakPhrase = async (
    text: string,
    bcp47: string,
    rate = 0.92,
    genderOverride?: VoiceGender,
    langCodeOverride?: string
  ) => {
    const activeGender = genderOverride || localGender;
    const langCode = langCodeOverride || selectedLang.code;
    await speakWithAiVoice({
      text,
      languageCode: langCode,
      bcp47,
      gender: activeGender,
      voiceNameOverride: activeGender === 'female' ? aiVoiceName : undefined,
      rate,
      styleContext: 'language',
      vietnameseRegion,
      onStart: () => setSpeakingText(text),
      onEnd: () => setSpeakingText(null),
    });
  };

  const handleRunAiTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tutorInput.trim()) return;
    setTutorLoading(true);
    setTutorError(null);
    try {
      const resp = await fetch('/api/language/tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: tutorMode,
          targetLanguage: `${selectedLang.nameVi} (${selectedLang.nativeName})`,
          userLevel,
          input: tutorInput,
          translateTo: translateTarget,
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setTutorError(json.error || 'Chưa thể kết nối Gia sư AI.');
      } else {
        setTutorOutput(json.result);
        onCompleteLesson(15);
      }
    } catch {
      setTutorError('Lỗi kết nối máy chủ AI Ngoại ngữ.');
    } finally {
      setTutorLoading(false);
    }
  };

  const handleVoiceDictation = () => {
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setTutorError('Trình duyệt hiện tại chưa hỗ trợ Web Speech Recognition; hãy nhập văn bản trực tiếp.');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const recognition = new (SpeechRecognition as any)();
      recognition.lang = selectedLang.bcp47;
      recognition.interimResults = false;
      recognition.onstart = () => setListening(true);
      recognition.onend = () => setListening(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript || '';
        if (transcript) {
          setTutorInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };
      recognition.onerror = () => setListening(false);
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  const correctQuizCount = ENGLISH_PLACEMENT_QUIZ.reduce((count, q) => {
    return count + (quizAnswers[q.id] === q.correctIndex ? 1 : 0);
  }, 0);
  const placementResult = evaluateLanguagePlacement(correctQuizCount, ENGLISH_PLACEMENT_QUIZ.length);

  return (
    <div className="space-y-6">
      {/* Global Language Selector Header */}
      <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">
              20 Ngôn ngữ Toàn cầu · {VOCAB_FLASHCARDS.length} Thẻ từ vựng · {CONVERSATION_PHRASEBOOK.length} Mẫu câu Thực tế · Trình độ {userLevel}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
              AI English & Trung tâm Ngoại ngữ Đa tình huống
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Học từ vựng theo 7 chủ đề, thực hành mẫu câu giao tiếp thực tế (sân bay, nhà hàng, sức khỏe, công việc), luyện nghe trắc nghiệm và hội thoại AI.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onOpenEnglishGameArena && (
              <button
                type="button"
                onClick={onOpenEnglishGameArena}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-500 dark:bg-[#FF6B1A] dark:text-zinc-950 whitespace-nowrap"
              >
                <Globe2 className="h-3.5 w-3.5" />
                <span>Chơi Game Tiếng Anh (9 Chủ đề · Đa AI)</span>
              </button>
            )}
            {onPlayStudyMusic && (
              <button
                type="button"
                onClick={onPlayStudyMusic}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  isStudyMusicPlaying
                    ? 'bg-amber-500 text-slate-950'
                    : 'border border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300'
                }`}
              >
                <Music2 className="h-3.5 w-3.5" />
                <span>{isStudyMusicPlaying ? 'Đang phát Lo-Fi học bài' : 'Nhạc Lo-Fi tập trung'}</span>
              </button>
            )}
            <label className="text-xs text-slate-500 dark:text-slate-400">
              Ngôn ngữ:
              <select
                value={selectedLang.code}
                onChange={(e) => {
                  onChangeTargetLanguage(e.target.value);
                  setCardIndex(0);
                  setFlipped(false);
                  setSelectedTopic('all');
                  setSelectedPhraseCat('all');
                  setPracticeIdx(0);
                  setPracticeSelected(null);
                }}
                className="ml-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {GLOBAL_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.nameVi} ({lang.nativeName})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Language Greeting Spotlight + Male & Female Global AI Voice Switcher */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-zinc-800 dark:bg-[#0D0F14]">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {selectedVoiceProfile.countryVi} ({selectedLang.nativeName}) · Hệ chữ {selectedLang.scriptFamily} · {lessonsCompleted} bài hoàn thành
            </div>
            <div className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              {selectedLang.sampleGreeting}
            </div>
            <div className="mt-0.5 font-mono text-xs text-orange-600 dark:text-[#FF6B1A]">
              {selectedLang.phonetic} · Đang chọn:{' '}
              {localGender === 'male'
                ? selectedVoiceProfile.male.personaName
                : selectedVoiceProfile.female.personaName}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Global Voice Gender Toggle */}
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
              <button
                type="button"
                onClick={() => {
                  setLocalGender('female');
                  onChangeVoiceGender?.('female');
                }}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  localGender === 'female'
                    ? 'bg-pink-600 text-white dark:bg-pink-500 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                Giọng Nữ AI
              </button>
              <button
                type="button"
                onClick={() => {
                  setLocalGender('male');
                  onChangeVoiceGender?.('male');
                }}
                className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  localGender === 'male'
                    ? 'bg-sky-600 text-white dark:bg-sky-400 dark:text-slate-950'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                }`}
              >
                Giọng Nam AI
              </button>
            </div>

            <button
              type="button"
              onClick={() =>
                void speakPhrase(selectedLang.sampleGreeting, selectedLang.bcp47, 0.94, 'female')
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-pink-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-pink-500 whitespace-nowrap"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>
                {speakingText === selectedLang.sampleGreeting && localGender === 'female'
                  ? 'Đang phát...'
                  : 'Nghe Nữ'}
              </span>
            </button>
            <button
              type="button"
              onClick={() =>
                void speakPhrase(selectedLang.sampleGreeting, selectedLang.bcp47, 0.94, 'male')
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 dark:bg-sky-400 dark:text-slate-950 whitespace-nowrap"
            >
              <Volume2 className="h-3.5 w-3.5" />
              <span>
                {speakingText === selectedLang.sampleGreeting && localGender === 'male'
                  ? 'Đang phát...'
                  : 'Nghe Nam'}
              </span>
            </button>
          </div>
        </div>

        {selectedLang.code === 'vi' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-orange-500/30 bg-orange-950/10 px-4 py-2.5 dark:bg-[#0D0F14]">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-orange-600 dark:text-[#FF6B1A]">
                Mẫu đối chiếu Giọng Tiếng Việt chuẩn · Chú Gà Con Tập Bay
              </div>
              <div className="text-[11px] text-slate-600 dark:text-slate-400">
                Nghe mẫu video chuẩn ngữ điệu kể chuyện tự nhiên và thử lại nút Nghe Nữ / Nghe Nam phía trên.
              </div>
            </div>
            <video
              controls
              preload="metadata"
              playsInline
              src="/assets/aistudio/chu_ga_con_tap_bay_2c1d5069.mp4"
              className="h-16 w-28 shrink-0 rounded-md border border-slate-700 bg-slate-950 object-cover"
            />
          </div>
        )}

        {/* Sub-navigation Tabs */}
        <div className="mt-5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab('flashcards')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'flashcards'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span>Từ vựng Theo chủ đề ({langCardsAll.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('phrases')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'phrases'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span>Mẫu câu Giao tiếp ({langPhrasesAll.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('practice')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'practice'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>Luyện nghe & Trắc nghiệm</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('ai_tutor')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'ai_tutor'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>AI Gia sư · Dịch & Sửa lỗi</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('placement')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              subTab === 'placement'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" />
            <span>Kiểm tra Trình độ (10 câu)</span>
          </button>
        </div>
      </section>

      {subTab === 'flashcards' && (
        <div className="space-y-4">
          {/* Topic Filter Bar */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(LANGUAGE_TOPIC_LABELS) as Array<'all' | LanguageTopicId>).map((topic) => (
              <button
                key={topic}
                type="button"
                onClick={() => {
                  setSelectedTopic(topic);
                  setCardIndex(0);
                  setFlipped(false);
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                  selectedTopic === topic
                    ? 'bg-zinc-900 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                    : 'border border-stone-200/90 bg-white/95 text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-[#13151C] dark:text-zinc-300'
                }`}
              >
                {LANGUAGE_TOPIC_LABELS[topic]}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-7 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Thẻ {(cardIndex % activeCards.length) + 1} / {activeCards.length} · Cấp {currentCard.level} · {LANGUAGE_TOPIC_LABELS[currentCard.topic]}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => speakPhrase(currentCard.word, selectedLang.bcp47, 0.72)}
                    className="text-xs font-medium text-slate-500 hover:text-orange-600 dark:text-slate-400"
                  >
                    Đọc chậm
                  </button>
                  <button
                    type="button"
                    onClick={() => speakPhrase(currentCard.word, selectedLang.bcp47)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:underline dark:text-[#FF6B1A]"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Phát âm</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setFlipped((f) => !f)}
                className="mt-4 flex min-h-[220px] w-full flex-col items-center justify-center rounded-xl border border-stone-200 bg-stone-50 p-6 text-center transition-colors hover:border-orange-500 dark:border-zinc-800 dark:bg-[#0D0F14]"
              >
                {!flipped ? (
                  <>
                    <div className="font-display text-3xl font-bold text-slate-900 dark:text-slate-100">
                      {currentCard.word}
                    </div>
                    <div className="mt-2 font-mono text-sm text-orange-600 dark:text-[#FF6B1A]">
                      {currentCard.phonetic}
                    </div>
                    <div className="mt-4 text-xs text-slate-500">Chạm để lật xem nghĩa và câu ví dụ thực tế</div>
                  </>
                ) : (
                  <>
                    <div className="font-display text-xl font-bold text-orange-600 dark:text-[#FF6B1A]">
                      {currentCard.meaningVi}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {currentCard.meaningEn}
                    </div>
                    <p className="mt-4 text-sm font-medium text-slate-900 dark:text-slate-100">
                      “{currentCard.exampleSentence}”
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {currentCard.exampleTranslationVi}
                    </p>
                  </>
                )}
              </button>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFlipped(false);
                    setCardIndex((i) => (i - 1 + activeCards.length) % activeCards.length);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                >
                  Thẻ trước
                </button>
                <button
                  type="button"
                  onClick={() => speakPhrase(currentCard.exampleSentence, selectedLang.bcp47)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
                >
                  <Volume2 className="h-3.5 w-3.5 text-orange-600 dark:text-[#FF6B1A]" />
                  <span>Nghe câu ví dụ</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCompleteLesson(10);
                    setFlipped(false);
                    setCardIndex((i) => (i + 1) % activeCards.length);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Đã nhớ (+10 XP) & Thẻ tiếp</span>
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                Giọng AI Nam & Nữ · Việt Nam & {AI_COUNTRY_VOICES.length} Quốc gia
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Chọn quốc gia để học hoặc bấm trực tiếp nút Nữ / Nam để nghe giọng đọc bản ngữ từng nước.
              </p>
              <div className="mt-4 max-h-72 space-y-2 overflow-y-auto pr-1">
                {GLOBAL_LANGUAGES.map((lang) => {
                  const vp = getCountryVoiceProfile(lang.code);
                  const active = lang.code === selectedLang.code;
                  return (
                    <div
                      key={lang.code}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs transition-colors ${
                        active
                          ? 'border-orange-500 bg-orange-50/70 dark:border-[#FF6B1A] dark:bg-orange-950/35'
                          : 'border-stone-200 dark:border-zinc-800'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onChangeTargetLanguage(lang.code);
                          setCardIndex(0);
                          setFlipped(false);
                          setSelectedTopic('all');
                          setSelectedPhraseCat('all');
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {vp.countryVi} · {lang.nameVi}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {lang.nativeName} · Nữ: {vp.female.personaName.split('(')[0].trim()} / Nam: {vp.male.personaName.split('(')[0].trim()}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            void speakPhrase(lang.sampleGreeting, lang.bcp47, 0.94, 'female', lang.code)
                          }
                          aria-label={`Nghe giọng nữ ${lang.nameVi}`}
                          className="rounded border border-pink-400/50 bg-pink-500/10 px-2 py-1 text-[11px] font-semibold text-pink-700 hover:bg-pink-500/20 dark:text-pink-300"
                        >
                          Nữ
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void speakPhrase(lang.sampleGreeting, lang.bcp47, 0.94, 'male', lang.code)
                          }
                          aria-label={`Nghe giọng nam ${lang.nameVi}`}
                          className="rounded border border-sky-400/50 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                        >
                          Nam
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}

      {subTab === 'phrases' && (
        <section className="space-y-4 rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Mẫu câu & Hội thoại Thực tế ({selectedLang.nameVi})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nghe câu nói mẫu, tốc độ chậm để luyện nhại giọng (shadowing) và xem gợi ý câu đáp tự nhiên.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(PHRASE_CATEGORY_LABELS) as Array<'all' | PhraseCategoryId>).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedPhraseCat(cat)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                    selectedPhraseCat === cat
                      ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                      : 'border border-stone-200 text-zinc-600 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {PHRASE_CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {activePhrases.map((phrase) => (
              <article
                key={phrase.id}
                className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-zinc-800 dark:bg-[#0D0F14]"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-orange-600 dark:text-[#FF6B1A]">
                      {PHRASE_CATEGORY_LABELS[phrase.category]} · {phrase.level}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => speakPhrase(phrase.nativeText, selectedLang.bcp47, 0.72)}
                        className="text-[11px] font-medium text-slate-500 hover:text-orange-600 dark:text-slate-400"
                      >
                        Chậm 0.7x
                      </button>
                      <button
                        type="button"
                        onClick={() => speakPhrase(phrase.nativeText, selectedLang.bcp47)}
                        className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:underline dark:text-[#FF6B1A]"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                        <span>Nghe</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Tình huống: {phrase.situation}
                  </div>
                  <p className="mt-2 font-display text-base font-bold text-slate-900 dark:text-slate-100">
                    {phrase.nativeText}
                  </p>
                  <div className="mt-1 font-mono text-xs text-orange-600 dark:text-[#FF6B1A]">
                    {phrase.phonetic}
                  </div>
                  <p className="mt-1.5 text-xs text-slate-700 dark:text-slate-300">
                    Nghĩa: {phrase.meaningVi}
                  </p>
                </div>

                <div className="mt-3 rounded-lg border border-stone-200/80 bg-white/90 p-2.5 text-xs dark:border-zinc-800 dark:bg-[#13151C]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Gợi ý đối đáp:</span>
                    <button
                      type="button"
                      onClick={() => speakPhrase(phrase.responseHintNative, selectedLang.bcp47)}
                      className="text-[11px] font-medium text-orange-600 hover:underline dark:text-[#FF6B1A]"
                    >
                      Nghe câu đáp
                    </button>
                  </div>
                  <p className="mt-1 font-medium text-slate-900 dark:text-slate-100">
                    “{phrase.responseHintNative}”
                  </p>
                  <p className="mt-0.5 text-slate-500 dark:text-slate-400">{phrase.responseHintVi}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {subTab === 'practice' && (
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Luyện nghe & Chọn nghĩa nhanh ({selectedLang.nameVi})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bấm nghe phát âm chuẩn rồi chọn đúng nghĩa tiếng Việt để cộng XP và giữ chuỗi trả lời đúng.
              </p>
            </div>
            <div className="font-mono text-xs font-semibold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
              Chuỗi đúng: {practiceStreak} câu
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-stone-200 bg-stone-50 p-6 dark:border-zinc-800 dark:bg-[#0D0F14]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Câu hỏi từ vựng · Cấp {practiceQuestion.item.level}
                </div>
                <div className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {practiceQuestion.item.word}
                </div>
                <div className="mt-0.5 font-mono text-xs text-orange-600 dark:text-[#FF6B1A]">
                  {practiceQuestion.item.phonetic}
                </div>
              </div>
              <button
                type="button"
                onClick={() => speakPhrase(practiceQuestion.item.word, selectedLang.bcp47)}
                className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-[#FF6B1A] dark:text-zinc-950"
              >
                <Volume2 className="h-4 w-4" />
                <span>Nghe phát âm</span>
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {practiceQuestion.options.map((opt, idx) => {
                const chosen = practiceSelected === idx;
                const showResult = practiceSelected !== null;
                let styleClass =
                  'border-stone-200 bg-white text-zinc-800 hover:border-orange-500 dark:border-zinc-800 dark:bg-[#13151C] dark:text-zinc-200';
                if (showResult && opt.correct) {
                  styleClass =
                    'border-emerald-500 bg-emerald-50 font-semibold text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200';
                } else if (showResult && chosen && !opt.correct) {
                  styleClass =
                    'border-rose-500 bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200';
                }

                return (
                  <button
                    key={opt.label}
                    type="button"
                    disabled={practiceSelected !== null}
                    onClick={() => {
                      setPracticeSelected(idx);
                      if (opt.correct) {
                        setPracticeStreak((s) => s + 1);
                        onCompleteLesson(15);
                      } else {
                        setPracticeStreak(0);
                      }
                    }}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition-colors ${styleClass}`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {practiceSelected !== null && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 text-xs dark:border-slate-800">
                <div className="text-slate-700 dark:text-slate-300">
                  Ví dụ: <strong>“{practiceQuestion.item.exampleSentence}”</strong> —{' '}
                  {practiceQuestion.item.exampleTranslationVi}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPracticeSelected(null);
                    setPracticeIdx((i) => i + 1);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Câu tiếp theo</span>
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {subTab === 'ai_tutor' && (
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'chat', label: 'Hội thoại AI trực tiếp' },
                { id: 'grammar', label: 'Sửa lỗi Ngữ pháp & Diễn đạt' },
                { id: 'translate', label: 'Dịch đa ngôn ngữ' },
                { id: 'dictionary', label: 'Từ điển thông minh' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setTutorMode(m.id as typeof tutorMode)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                    tutorMode === m.id
                      ? 'bg-zinc-900 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                      : 'border border-stone-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {tutorMode === 'translate' && (
              <div className="flex items-center gap-2 text-xs">
                <Languages className="h-3.5 w-3.5 text-slate-500" />
                <span>Dịch sang:</span>
                <select
                  value={translateTarget}
                  onChange={(e) => setTranslateTarget(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800"
                >
                  {GLOBAL_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.nameVi}>
                      {l.nameVi}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <form onSubmit={handleRunAiTutor} className="mt-4 space-y-3">
            <textarea
              rows={3}
              value={tutorInput}
              onChange={(e) => setTutorInput(e.target.value)}
              placeholder={
                tutorMode === 'chat'
                  ? `Nói hoặc nhập câu bằng ${selectedLang.nameVi} để luyện phản xạ với AI...`
                  : tutorMode === 'grammar'
                    ? `Nhập đoạn viết bằng ${selectedLang.nameVi} để AI sửa lỗi ngữ pháp...`
                    : tutorMode === 'dictionary'
                      ? `Nhập từ hoặc cụm từ ${selectedLang.nameVi} cần tra phiên âm & ví dụ...`
                      : 'Nhập văn bản bất kỳ cần dịch chính xác...'
              }
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={tutorLoading}
                className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 dark:bg-[#FF6B1A] dark:text-zinc-950"
              >
                {tutorLoading ? 'AI đang xử lý...' : 'Gửi tới Gia sư AI'}
              </button>
              <button
                type="button"
                onClick={handleVoiceDictation}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200"
              >
                <Mic className="h-3.5 w-3.5 text-orange-600 dark:text-[#FF6B1A]" />
                <span>{listening ? 'Đang nghe...' : 'Luyện nói bằng Micro'}</span>
              </button>
            </div>
          </form>

          {tutorError && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              {tutorError}
            </div>
          )}

          {tutorOutput && (
            <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-zinc-800 dark:bg-[#0D0F14]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-orange-600 dark:text-[#FF6B1A]">
                  Phản hồi từ AI Language Tutor
                </span>
                <button
                  type="button"
                  onClick={() => speakPhrase(tutorOutput.slice(0, 220), selectedLang.bcp47)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-orange-600 dark:text-slate-300"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Đọc to</span>
                </button>
              </div>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                {tutorOutput}
              </div>
            </div>
          )}
        </section>
      )}

      {subTab === 'placement' && (
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
            Kiểm tra Trình độ Tiếng Anh (A1 – C2)
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Hoàn thành {ENGLISH_PLACEMENT_QUIZ.length} câu hỏi phân tầng từ A1 đến C2 để hệ thống tự động hiệu chỉnh trình độ học tập của bạn.
          </p>

          <div className="mt-5 space-y-5">
            {ENGLISH_PLACEMENT_QUIZ.map((q, idx) => (
              <div key={q.id} className="rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                <div className="text-xs font-semibold text-orange-600 dark:text-[#FF6B1A]">
                  Câu {idx + 1} · Mức {q.level}
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {q.question}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {q.options.map((opt, optIdx) => {
                    const selected = quizAnswers[q.id] === optIdx;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setQuizAnswers((prev) => ({ ...prev, [q.id]: optIdx }))}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                          selected
                            ? 'border-orange-500 bg-orange-50 font-semibold text-orange-900 dark:border-[#FF6B1A] dark:bg-orange-950/35 dark:text-orange-200'
                            : 'border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {quizSubmitted && (
                  <p
                    className={`mt-2 text-xs ${
                      quizAnswers[q.id] === q.correctIndex
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {quizAnswers[q.id] === q.correctIndex ? 'Chính xác: ' : 'Chưa đúng: '}
                    {q.explanation}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => {
                setQuizSubmitted(true);
                onUpdateLevel(placementResult.level);
                onCompleteLesson(30);
              }}
              className="rounded-lg bg-orange-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
            >
              Chấm điểm & Cập nhật Trình độ
            </button>

            {quizSubmitted && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-xs text-orange-900 dark:border-orange-900 dark:bg-orange-950/35 dark:text-orange-200">
                Kết quả: <strong>{correctQuizCount}/{ENGLISH_PLACEMENT_QUIZ.length}</strong> ({placementResult.scorePct}%) · Trình độ đề xuất: <strong>{placementResult.level}</strong> — {placementResult.recommendation}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
