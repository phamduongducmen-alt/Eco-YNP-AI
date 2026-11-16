import type {
  AppPersistentState,
  AuditLogEntry,
  ThemeMode,
  UiLanguage,
} from '../types/lifeworld';

const STATE_KEY = 'ai_life_world_state_v1';
const THEME_KEY = 'ai_life_world_theme_v1';
const UI_LANG_KEY = 'ai_life_world_ui_lang_v1';

export function createDefaultState(): AppPersistentState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    profile: {
      displayName: 'Minh Anh',
      age: 27,
      sex: 'female',
      heightCm: 163,
      weightKg: 54,
      goal: 'maintain',
      activityLevel: 'moderate',
      dietaryPreference: 'Cân bằng (Whole Foods)',
      allergies: ['Không dị ứng'],
      targetLanguageCode: 'en',
      languageLevel: 'B1',
      dailyWorkoutMinutes: 30,
      wakeTime: '06:30',
      sleepTime: '22:45',
      aiVoiceName: 'Kore',
      aiVoiceGender: 'female',
      vietnameseRegion: 'north',
      dailyStepGoal: 8000,
      dailyWaterGoalMl: 2100,
    },
    permissions: {
      camera: false,
      microphone: false,
      healthData: true,
      allowAiPersonalData: false,
      notifications: false,
    },
    stepsToday: 5420,
    sleepHoursLastNight: 7.4,
    waterMlToday: 1250,
    meditationMinutesToday: 10,
    languageLessonsCompleted: 4,
    streakDays: 6,
    schedules: [
      {
        id: 'sch-1',
        time: '07:00',
        title: 'Uống 300ml nước ấm & giãn cơ sáng',
        category: 'water',
        enabled: true,
        voiceAlert: false,
      },
      {
        id: 'sch-2',
        time: '10:30',
        title: 'Đứng dậy vận động 5 phút (giảm mỏi cổ vai)',
        category: 'move',
        enabled: true,
        voiceAlert: true,
      },
      {
        id: 'sch-3',
        time: '17:30',
        title: 'Tập Yoga & Core 25 phút tại nhà',
        category: 'workout',
        enabled: true,
        voiceAlert: true,
      },
      {
        id: 'sch-4',
        time: '21:15',
        title: 'Ôn 15 thẻ từ vựng ngoại ngữ & thiền ngủ',
        category: 'study',
        enabled: true,
        voiceAlert: false,
      },
    ],
    workouts: [
      {
        id: 'wk-seed-1',
        exerciseId: 'yoga-sun-salutation',
        exerciseName: 'Chào Mặt Trời (Sun Salutation)',
        durationMinutes: 15,
        caloriesBurned: 58,
        completedAt: now,
      },
    ],
    meals: [
      {
        id: 'meal-seed-1',
        name: 'Yến mạch sữa chua Hy Lạp & quả mọng',
        mealSlot: 'breakfast',
        grams: 280,
        calories: 365,
        proteinG: 18.5,
        carbsG: 48,
        fatG: 10.2,
        fiberG: 7.5,
        sugarG: 11,
        sodiumMg: 95,
        sourceType: 'library',
        loggedAt: now,
      },
      {
        id: 'meal-seed-2',
        name: 'Cơm gạo lứt, ức gà áp chảo & bông cải xanh',
        mealSlot: 'lunch',
        grams: 420,
        calories: 540,
        proteinG: 42,
        carbsG: 58,
        fatG: 13.5,
        fiberG: 6.8,
        sugarG: 3.5,
        sodiumMg: 460,
        sourceType: 'library',
        loggedAt: now,
      },
    ],
    habits: [
      { id: 'hab-1', title: 'Uống đủ 2L nước mỗi ngày', completedToday: false, streak: 6 },
      { id: 'hab-2', title: 'Tập luyện hoặc Yoga tối thiểu 20 phút', completedToday: true, streak: 5 },
      { id: 'hab-3', title: 'Thiền định / hít thở 10 phút', completedToday: true, streak: 4 },
      { id: 'hab-4', title: 'Học 10 từ vựng ngoại ngữ mới', completedToday: false, streak: 7 },
    ],
    moodJournals: [],
    game: {
      xp: 340,
      badges: ['Khởi đầu Bền bỉ', 'Người giữ Nhịp Thở'],
      completedQuestIds: ['quest-hydrate'],
      highScores: {
        memoryMovesBest: null,
        reflexMsBest: null,
        mathStreakBest: 0,
        logicSolved: 1,
        vocabStreakBest: 3,
        worldOrbsCollected: 0,
        kidArcadeBestScore: 0,
        rhythmBestScore: 0,
        stroopBestScore: 0,
        englishArenaBestScore: 0,
      },
      avatarStyle: {
        suitColor: '#0d9488',
        visorColor: '#38bdf8',
        companionName: 'Aura',
      },
    },
    auditLog: [
      {
        id: 'aud-init',
        timestamp: now,
        action: 'Khởi tạo kho dữ liệu cục bộ',
        module: 'Security',
        detail: 'Sẵn sàng mã hóa AES-256-GCM trên thiết bị',
      },
    ],
  };
}

export function loadPersistedState(): AppPersistentState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createDefaultState();
  }
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw) as Partial<AppPersistentState>;
    const defaults = createDefaultState();
    return {
      ...defaults,
      ...parsed,
      profile: { ...defaults.profile, ...(parsed.profile || {}) },
      permissions: { ...defaults.permissions, ...(parsed.permissions || {}) },
      game: {
        ...defaults.game,
        ...(parsed.game || {}),
        highScores: {
          ...defaults.game.highScores,
          ...(parsed.game?.highScores || {}),
        },
        avatarStyle: {
          ...defaults.game.avatarStyle,
          ...(parsed.game?.avatarStyle || {}),
        },
      },
    };
  } catch {
    return createDefaultState();
  }
}

export function savePersistedState(state: AppPersistentState): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors gracefully
  }
}

export function clearAllPersistedData(): AppPersistentState {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STATE_KEY);
  }
  return createDefaultState();
}

export function appendAuditLog(
  current: AuditLogEntry[],
  action: string,
  module: string,
  detail: string
): AuditLogEntry[] {
  const entry: AuditLogEntry = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    action,
    module,
    detail,
  };
  return [entry, ...current].slice(0, 60);
}

export function loadThemePreference(): ThemeMode {
  if (typeof window === 'undefined' || !window.localStorage) return 'dark';
  const saved = window.localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return 'dark';
}

export function saveThemePreference(theme: ThemeMode): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(THEME_KEY, theme);
}

export function loadUiLanguage(): UiLanguage {
  if (typeof window === 'undefined' || !window.localStorage) return 'vi';
  const saved = window.localStorage.getItem(UI_LANG_KEY);
  return saved === 'en' ? 'en' : 'vi';
}

export function saveUiLanguage(lang: UiLanguage): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.setItem(UI_LANG_KEY, lang);
}
