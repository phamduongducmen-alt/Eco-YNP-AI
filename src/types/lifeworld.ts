export type AppModuleId =
  | 'dashboard'
  | 'timer'
  | 'fitness'
  | 'nutrition'
  | 'languages'
  | 'games'
  | 'meditation'
  | 'assistant';

export type UiLanguage = 'vi' | 'en';
export type ThemeMode = 'light' | 'dark';

export type BiologicalSex = 'male' | 'female' | 'other';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'athlete';
export type FitnessGoal = 'lose_fat' | 'maintain' | 'build_muscle' | 'endurance';
export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export type VoiceGender = 'female' | 'male';

export interface UserPermissions {
  camera: boolean;
  microphone: boolean;
  healthData: boolean;
  allowAiPersonalData: boolean;
  notifications: boolean;
}

export interface UserPersonalProfile {
  displayName: string;
  age: number;
  sex: BiologicalSex;
  heightCm: number;
  weightKg: number;
  goal: FitnessGoal;
  activityLevel: ActivityLevel;
  dietaryPreference: string;
  allergies: string[];
  targetLanguageCode: string;
  languageLevel: CefrLevel;
  dailyWorkoutMinutes: number;
  wakeTime: string;
  sleepTime: string;
  aiVoiceName: 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';
  aiVoiceGender: VoiceGender;
  vietnameseRegion: 'north' | 'south';
  dailyStepGoal: number;
  dailyWaterGoalMl: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  module: string;
  detail: string;
}

export type TimerMode =
  | 'clock'
  | 'stopwatch'
  | 'countdown'
  | 'pomodoro'
  | 'workout'
  | 'yoga'
  | 'rest';

export interface ScheduleRoutineItem {
  id: string;
  time: string;
  title: string;
  category: 'water' | 'move' | 'sleep' | 'study' | 'workout' | 'meditation' | 'meal';
  enabled: boolean;
  voiceAlert: boolean;
}

export type ExerciseCategory =
  | 'yoga_beginner'
  | 'yoga_advanced'
  | 'yoga_stress'
  | 'yoga_flexibility'
  | 'yoga_morning_sleep'
  | 'gym_strength'
  | 'calisthenics'
  | 'football_agility'
  | 'running_boxing'
  | 'pilates'
  | 'aerobic'
  | 'cardio'
  | 'hiit'
  | 'core'
  | 'upper_lower'
  | 'squat_plank_pushup'
  | 'stretching'
  | 'posture'
  | 'recovery'
  | 'sedentary'
  | 'no_equipment'
  | 'home_equipment';

export type ExerciseEquipmentProp =
  | 'yoga_mat'
  | 'yoga_blocks'
  | 'pullup_bar'
  | 'parallettes'
  | 'goblet_dumbbell'
  | 'dumbbells'
  | 'bench_dumbbell'
  | 'soccer_ball'
  | 'agility_ladder'
  | 'resistance_cones'
  | 'running_track'
  | 'boxing_bag'
  | 'chair';

export interface ExerciseItem {
  id: string;
  name: string;
  nameEn: string;
  categories: ExerciseCategory[];
  difficulty: 'Cơ bản' | 'Trung bình' | 'Nâng cao';
  durationMinutes: number;
  repsOrHold: string;
  sets: number;
  restSeconds: number;
  met: number;
  equipment: string;
  equipmentProp?: ExerciseEquipmentProp;
  breathingGuide: string;
  breathCycleSec?: { inhale: number; hold: number; exhale: number };
  steps: string[];
  safetyWarnings: string[];
  postureErrors: string[];
  poseType:
    | 'sun_salutation'
    | 'plank'
    | 'squat'
    | 'pushup'
    | 'bridge'
    | 'stretch'
    | 'pigeon_pose'
    | 'pike_dips'
    | 'l_sit'
    | 'dumbbell_row'
    | 'single_leg_rdl'
    | 'running_stride'
    | 'seated_posture'
    | 'cardio_jump'
    | 'warrior'
    | 'pullup_row'
    | 'agility_drill'
    | 'gym_press'
    | 'boxing_guard'
    | 'lunge_twist';
  guideImage: string;
  guideCaption: string;
  youtubeVideoId: string;
  youtubeTitle: string;
  youtubeChannel: string;
  youtubeSearchQuery: string;
}

export interface WorkoutLogEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  durationMinutes: number;
  caloriesBurned: number;
  completedAt: string;
}

export type FoodCategoryId =
  | 'vegetables'
  | 'fruits'
  | 'meat'
  | 'seafood'
  | 'eggs'
  | 'dairy'
  | 'grains'
  | 'nuts_seeds'
  | 'legumes_plant'
  | 'beverages'
  | 'fast_food'
  | 'packaged'
  | 'frozen'
  | 'sweets'
  | 'supplements';

export interface FoodCatalogItem {
  id: string;
  name: string;
  nameEn: string;
  category: FoodCategoryId;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  sugarPer100g: number;
  sodiumMgPer100g: number;
  servingLabel: string;
  servingGrams: number;
  vitaminsMinerals: string[];
  benefits: string;
  allergens: string[];
  storageGuide: string;
  shelfLife: string;
  processingLevel: 'Tự nhiên (NOVA 1)' | 'Sơ chế (NOVA 2)' | 'Chế biến (NOVA 3)' | 'Siêu chế biến (NOVA 4)';
  pairings: string[];
  sourceNote: string;
}

export interface MealLogEntry {
  id: string;
  name: string;
  mealSlot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  grams: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  sugarG: number;
  sodiumMg: number;
  sourceType: 'library' | 'manual' | 'ai_photo' | 'barcode';
  confidenceNote?: string;
  loggedAt: string;
}

export interface LanguageDefinition {
  code: string;
  bcp47: string;
  nameVi: string;
  nativeName: string;
  scriptFamily: string;
  sampleGreeting: string;
  phonetic: string;
}

export type LanguageTopicId =
  | 'daily'
  | 'health'
  | 'food'
  | 'travel'
  | 'work'
  | 'study'
  | 'shopping';

export interface VocabFlashcard {
  id: string;
  languageCode: string;
  topic: LanguageTopicId;
  level: CefrLevel;
  word: string;
  phonetic: string;
  meaningVi: string;
  meaningEn: string;
  exampleSentence: string;
  exampleTranslationVi: string;
}

export type PhraseCategoryId =
  | 'greeting'
  | 'travel'
  | 'restaurant'
  | 'health'
  | 'work'
  | 'shopping'
  | 'emergency';

export interface PhrasebookEntry {
  id: string;
  languageCode: string;
  category: PhraseCategoryId;
  level: CefrLevel;
  situation: string;
  nativeText: string;
  phonetic: string;
  meaningVi: string;
  responseHintNative: string;
  responseHintVi: string;
}

export type MusicGenreId =
  | 'phonk'
  | 'usuk'
  | 'vpop'
  | 'lofi'
  | 'piano'
  | 'zen'
  | 'chillhop'
  | 'arcade';

export interface MusicTrack {
  id: string;
  title: string;
  artistTag: string;
  genre: MusicGenreId;
  bpm: number;
  moodVi: string;
  recommendedModules: AppModuleId[];
  rootHz: number;
  scaleSemitones: number[];
  chordProgressions: number[][];
  bassPattern: number[];
  leadPattern: number[];
  drumStyle:
    | 'phonk'
    | 'four_floor'
    | 'vpop_chill'
    | 'boom_bap'
    | 'piano_soft'
    | 'chillhop'
    | 'zen_chime'
    | 'arcade';
  synthVoice: 'cowbell' | 'supersaw' | 'rhodes' | 'pluck' | 'piano' | 'pad' | 'bowl' | 'square';
}

export interface DailyHabitItem {
  id: string;
  title: string;
  completedToday: boolean;
  streak: number;
}

export interface EncryptedMoodJournalEntry {
  id: string;
  createdAt: string;
  moodScore: 1 | 2 | 3 | 4 | 5;
  moodLabel: string;
  tags: string[];
  /** Plaintext in memory when unlocked; persisted encrypted via AES-256-GCM */
  note: string;
  encryptedEnvelope?: {
    algorithm: 'AES-GCM-256' | 'XOR-OBFUSCATED-FALLBACK';
    ivHex: string;
    ciphertextBase64: string;
    encryptedAt: string;
    keyFingerprint: string;
  };
}

export type AssistantPersonaId =
  | 'general'
  | 'fitness'
  | 'yoga'
  | 'nutrition'
  | 'language'
  | 'study'
  | 'wellness'
  | 'planner';

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  persona: AssistantPersonaId;
  text: string;
  createdAt: string;
  error?: boolean;
}

export interface GameProgressionState {
  xp: number;
  badges: string[];
  completedQuestIds: string[];
  highScores: {
    memoryMovesBest: number | null;
    reflexMsBest: number | null;
    mathStreakBest: number;
    logicSolved: number;
    vocabStreakBest: number;
    worldOrbsCollected: number;
    kidArcadeBestScore: number;
    rhythmBestScore?: number;
    stroopBestScore?: number;
    englishArenaBestScore?: number;
  };
  avatarStyle: {
    suitColor: string;
    visorColor: string;
    companionName: string;
  };
}

export interface AppPersistentState {
  schemaVersion: number;
  profile: UserPersonalProfile;
  permissions: UserPermissions;
  stepsToday: number;
  sleepHoursLastNight: number;
  waterMlToday: number;
  meditationMinutesToday: number;
  languageLessonsCompleted: number;
  streakDays: number;
  schedules: ScheduleRoutineItem[];
  workouts: WorkoutLogEntry[];
  meals: MealLogEntry[];
  habits: DailyHabitItem[];
  moodJournals: EncryptedMoodJournalEntry[];
  game: GameProgressionState;
  auditLog: AuditLogEntry[];
}
