import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { X } from 'lucide-react';
import { AiAssistantView } from './components/AiAssistantView';
import { DashboardView } from './components/DashboardView';
import { GameWorldView } from './components/GameWorldView';
import { HomeFitnessView } from './components/HomeFitnessView';
import { KidStarGameShell, type KidStarRoundResult } from './components/KidStarGameShell';
import { LanguageHubView } from './components/LanguageHubView';
import { MeditationWellnessView } from './components/MeditationWellnessView';
import { ModuleSoundtrackBar } from './components/ModuleSoundtrackBar';
import {
  MusicStudioModal,
  type ActiveExternalMusicStream,
  type MusicStudioSourceTab,
} from './components/MusicStudioModal';
import { NutritionAndFoodView } from './components/NutritionAndFoodView';
import { ProfileSecurityModal } from './components/ProfileSecurityModal';
import { SidebarNav } from './components/SidebarNav';
import { SmartTimerView } from './components/SmartTimerView';
import { TopHeader } from './components/TopHeader';
import { MUSIC_GENRE_META } from './data/musicTracks';
import { musicEngine, type MusicPlayerSnapshot } from './utils/musicEngine';
import type {
  AppModuleId,
  AppPersistentState,
  CefrLevel,
  EncryptedMoodJournalEntry,
  ExerciseItem,
  GameProgressionState,
  MealLogEntry,
  ScheduleRoutineItem,
  ThemeMode,
  TimerMode,
  UiLanguage,
  UserPermissions,
  UserPersonalProfile,
} from './types/lifeworld';
import {
  auth,
  deleteCloudUserData,
  listEncryptedJournalsFromCloud,
  mapFirebaseUserToUnified,
  pullWellnessSyncFromCloud,
  pushEncryptedJournalToCloud,
  pushWellnessSyncToCloud,
  signInWithGooglePopup,
  syncFirebaseUserProfile,
  testFirestoreConnectionOnce,
  type DatabaseConnectionState,
  type UnifiedAuthUser,
} from './utils/firebase';
import { computeLevelFromXp } from './utils/gameEngine';
import {
  appendAuditLog,
  clearAllPersistedData,
  loadPersistedState,
  loadThemePreference,
  loadUiLanguage,
  savePersistedState,
  saveThemePreference,
  saveUiLanguage,
} from './utils/storage';

const VALID_MODULES: AppModuleId[] = [
  'dashboard',
  'timer',
  'fitness',
  'nutrition',
  'languages',
  'games',
  'meditation',
  'assistant',
];

function getInitialModule(): AppModuleId {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  const mod = params.get('module') as AppModuleId | null;
  if (mod && VALID_MODULES.includes(mod)) {
    return mod;
  }
  return 'dashboard';
}

export function App() {
  const [state, setState] = useState<AppPersistentState>(() => loadPersistedState());
  const [activeModule, setActiveModule] = useState<AppModuleId>(() => getInitialModule());
  const [theme, setTheme] = useState<ThemeMode>(() => loadThemePreference());
  const [uiLang, setUiLang] = useState<UiLanguage>(() => loadUiLanguage());
  const [aiConfigured, setAiConfigured] = useState<boolean>(false);
  const [claudeConfigured, setClaudeConfigured] = useState<boolean>(false);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  const [kidGameOpen, setKidGameOpen] = useState<boolean>(false);
  const [musicModalOpen, setMusicModalOpen] = useState<boolean>(false);
  const [musicStudioTab, setMusicStudioTab] = useState<MusicStudioSourceTab>('studio');
  const [activeExternalStream, setActiveExternalStream] =
    useState<ActiveExternalMusicStream | null>(null);
  const [musicState, setMusicState] = useState<MusicPlayerSnapshot>(() => musicEngine.getSnapshot());
  const [authUser, setAuthUser] = useState<UnifiedAuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [dbStatus, setDbStatus] = useState<DatabaseConnectionState>('checking');

  const cloudHydratedUidRef = useRef<string | null>(null);
  const skipNextAutoPushRef = useRef<boolean>(false);

  useEffect(() => {
    return musicEngine.subscribe(setMusicState);
  }, []);

  useEffect(() => {
    musicEngine.syncModuleIfEnabled(activeModule);
  }, [activeModule]);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    saveThemePreference(theme);
  }, [theme]);

  useEffect(() => {
    saveUiLanguage(uiLang);
  }, [uiLang]);

  useEffect(() => {
    savePersistedState(state);
  }, [state]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [activeModule]);

  // Check backend /api/health and Firestore connectivity on mount
  useEffect(() => {
    let active = true;
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        if (active && typeof data.aiConfigured === 'boolean') {
          setAiConfigured(data.aiConfigured);
        }
        if (active && typeof data.claudeConfigured === 'boolean') {
          setClaudeConfigured(data.claudeConfigured);
        }
      })
      .catch(() => {
        if (active) {
          setAiConfigured(false);
          setClaudeConfigured(false);
        }
      });

    void testFirestoreConnectionOnce().then((status) => {
      if (active) setDbStatus(status);
    });

    return () => {
      active = false;
    };
  }, []);

  // Listen to Firebase Auth state & hydrate Cloud Firestore automatically
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        setAuthUser(null);
        setSyncState('idle');
        cloudHydratedUidRef.current = null;
        return;
      }

      const unified = mapFirebaseUserToUnified(fbUser);
      setAuthUser(unified);

      try {
        await syncFirebaseUserProfile(unified);
      } catch {
        // non-blocking profile sync error
      }

      if (cloudHydratedUidRef.current !== unified.uid) {
        cloudHydratedUidRef.current = unified.uid;
        setSyncState('syncing');
        try {
          const [remote, remoteJournals] = await Promise.all([
            pullWellnessSyncFromCloud(),
            listEncryptedJournalsFromCloud(),
          ]);

          skipNextAutoPushRef.current = true;
          setState((prev) => ({
            ...prev,
            ...(remote || {}),
            profile: {
              ...prev.profile,
              ...(remote?.profile || {}),
              displayName:
                remote?.profile?.displayName ||
                unified.displayName ||
                prev.profile.displayName,
            },
            game: {
              ...prev.game,
              ...(remote?.game || {}),
              xp: Math.max(prev.game.xp, remote?.game?.xp ?? 0),
              highScores: {
                ...prev.game.highScores,
                ...(remote?.game?.highScores || {}),
                kidArcadeBestScore: Math.max(
                  prev.game.highScores.kidArcadeBestScore,
                  remote?.game?.highScores?.kidArcadeBestScore ?? 0
                ),
              },
            },
            moodJournals: remoteJournals.length > 0 ? remoteJournals : prev.moodJournals,
            auditLog: appendAuditLog(
              prev.auditLog,
              'Tự động đồng bộ Cloud Google',
              'Firestore',
              `Tài khoản ${unified.email || unified.displayName}`
            ),
          }));
          setSyncState('synced');
        } catch {
          setSyncState('error');
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const levelInfo = computeLevelFromXp(state.game.xp);
  const workoutCaloriesBurned = state.workouts.reduce((sum, w) => sum + w.caloriesBurned, 0);

  // Debounced auto-sync to Cloud Firestore whenever state updates for signed-in Google user
  useEffect(() => {
    if (!authUser || !auth.currentUser) return;
    if (skipNextAutoPushRef.current) {
      skipNextAutoPushRef.current = false;
      return;
    }

    setSyncState('syncing');
    const timer = window.setTimeout(() => {
      void pushWellnessSyncToCloud(state, levelInfo.level)
        .then(() => {
          setSyncState('synced');
        })
        .catch(() => {
          setSyncState('error');
        });
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [authUser, levelInfo.level, state]);

  // Auto-dismiss auth notification banner
  useEffect(() => {
    if (!authNotice) return;
    const t = window.setTimeout(() => setAuthNotice(null), 5000);
    return () => window.clearTimeout(t);
  }, [authNotice]);

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const user = await signInWithGooglePopup();
      setState((prev) => ({
        ...prev,
        profile: {
          ...prev.profile,
          displayName: user.displayName || prev.profile.displayName,
        },
        auditLog: appendAuditLog(
          prev.auditLog,
          'Đăng nhập Google từ thanh tiêu đề',
          'Auth',
          user.email || user.displayName
        ),
      }));
      setAuthNotice(`Đã đăng nhập Google: ${user.displayName}. Dữ liệu tự động đồng bộ Cloud.`);
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : '';
      if (raw.includes('popup-closed-by-user')) {
        setAuthNotice('Bạn đã đóng cửa sổ đăng nhập Google.');
      } else if (raw.includes('popup-blocked')) {
        setAuthNotice('Trình duyệt đang chặn popup. Vui lòng cho phép popup để đăng nhập Google.');
      } else {
        setAuthNotice('Không thể hoàn tất đăng nhập Google lúc này. Bạn có thể mở Hồ sơ để thử lại.');
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleToggleTheme = () => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  };

  const handleToggleUiLang = () => {
    setUiLang((l) => (l === 'vi' ? 'en' : 'vi'));
  };

  const handleAddWater = (ml: number) => {
    setState((prev) => ({
      ...prev,
      waterMlToday: Math.max(0, prev.waterMlToday + ml),
      game: { ...prev.game, xp: prev.game.xp + 5 },
    }));
  };

  const handleAddSteps = (steps: number) => {
    setState((prev) => ({
      ...prev,
      stepsToday: Math.max(0, prev.stepsToday + steps),
      game: { ...prev.game, xp: prev.game.xp + 10 },
    }));
  };

  const handleToggleHabit = (habitId: string) => {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.map((h) => {
        if (h.id !== habitId) return h;
        const nextDone = !h.completedToday;
        return {
          ...h,
          completedToday: nextDone,
          streak: nextDone ? h.streak + 1 : Math.max(0, h.streak - 1),
        };
      }),
    }));
  };

  const handleAddHabit = (title: string) => {
    setState((prev) => ({
      ...prev,
      habits: [
        ...prev.habits,
        {
          id: `hab-${Date.now()}`,
          title,
          completedToday: false,
          streak: 0,
        },
      ],
    }));
  };

  const handleDeleteHabit = (id: string) => {
    setState((prev) => ({
      ...prev,
      habits: prev.habits.filter((h) => h.id !== id),
    }));
  };

  const handleAddSchedule = (item: Omit<ScheduleRoutineItem, 'id'>) => {
    setState((prev) => ({
      ...prev,
      schedules: [...prev.schedules, { ...item, id: `sch-${Date.now()}` }].sort((a, b) =>
        a.time.localeCompare(b.time)
      ),
    }));
  };

  const handleToggleSchedule = (id: string) => {
    setState((prev) => ({
      ...prev,
      schedules: prev.schedules.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
    }));
  };

  const handleDeleteSchedule = (id: string) => {
    setState((prev) => ({
      ...prev,
      schedules: prev.schedules.filter((s) => s.id !== id),
    }));
  };

  const handleUpdateSleepSchedule = (wakeTime: string, sleepTime: string) => {
    setState((prev) => ({
      ...prev,
      profile: { ...prev.profile, wakeTime, sleepTime },
      auditLog: appendAuditLog(
        prev.auditLog,
        'Cập nhật giờ ngủ/thức dậy',
        'Smart Timer',
        `Dậy ${wakeTime} · Ngủ ${sleepTime}`
      ),
    }));
  };

  const handleCompleteTimerSession = (mode: TimerMode, minutes: number) => {
    setState((prev) => ({
      ...prev,
      meditationMinutesToday:
        mode === 'yoga'
          ? prev.meditationMinutesToday + minutes
          : prev.meditationMinutesToday,
      game: { ...prev.game, xp: prev.game.xp + 20 },
      auditLog: appendAuditLog(
        prev.auditLog,
        `Hoàn thành phiên ${mode}`,
        'Smart Timer',
        `${minutes} phút (+20 XP)`
      ),
    }));
  };

  const handleLogWorkout = (exercise: ExerciseItem, durationMin: number, calories: number) => {
    setState((prev) => ({
      ...prev,
      workouts: [
        {
          id: `wk-${Date.now()}`,
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          durationMinutes: durationMin,
          caloriesBurned: calories,
          completedAt: new Date().toISOString(),
        },
        ...prev.workouts,
      ],
      game: { ...prev.game, xp: prev.game.xp + 35 },
      auditLog: appendAuditLog(
        prev.auditLog,
        'Hoàn thành bài tập tại nhà',
        'Home Fitness',
        `${exercise.name} · ${durationMin} phút (${calories} kcal)`
      ),
    }));
  };

  const handleAddMeal = (meal: Omit<MealLogEntry, 'id' | 'loggedAt'>) => {
    setState((prev) => ({
      ...prev,
      meals: [
        {
          ...meal,
          id: `meal-${Date.now()}`,
          loggedAt: new Date().toISOString(),
        },
        ...prev.meals,
      ],
      game: { ...prev.game, xp: prev.game.xp + 15 },
      auditLog: appendAuditLog(
        prev.auditLog,
        'Ghi nhận bữa ăn',
        'Nutrition',
        `${meal.name} (${meal.calories} kcal)`
      ),
    }));
  };

  const handleDeleteMeal = (id: string) => {
    setState((prev) => ({
      ...prev,
      meals: prev.meals.filter((m) => m.id !== id),
    }));
  };

  const handleCompleteLanguageLesson = (xpReward: number) => {
    setState((prev) => ({
      ...prev,
      languageLessonsCompleted: prev.languageLessonsCompleted + 1,
      game: { ...prev.game, xp: prev.game.xp + xpReward },
    }));
  };

  const handleAddXp = (amount: number, badge?: string) => {
    setState((prev) => ({
      ...prev,
      game: {
        ...prev.game,
        xp: prev.game.xp + amount,
        badges:
          badge && !prev.game.badges.includes(badge)
            ? [...prev.game.badges, badge]
            : prev.game.badges,
      },
    }));
  };

  const handleUpdateHighScore = (patch: Partial<GameProgressionState['highScores']>) => {
    setState((prev) => ({
      ...prev,
      game: {
        ...prev.game,
        highScores: { ...prev.game.highScores, ...patch },
      },
    }));
  };

  const handleUpdateAvatar = (patch: Partial<GameProgressionState['avatarStyle']>) => {
    setState((prev) => ({
      ...prev,
      game: {
        ...prev.game,
        avatarStyle: { ...prev.game.avatarStyle, ...patch },
      },
    }));
  };

  const handleFinishKidGameRound = useCallback((result: KidStarRoundResult) => {
    setState((prev) => {
      const nextBest = Math.max(prev.game.highScores.kidArcadeBestScore, result.score);
      const earnedBadge =
        result.starsCaught >= 8 && !prev.game.badges.includes('Ngôi sao Nhí Thông minh')
          ? 'Ngôi sao Nhí Thông minh'
          : undefined;
      return {
        ...prev,
        game: {
          ...prev.game,
          xp: prev.game.xp + result.xpEarned,
          badges: earnedBadge ? [...prev.game.badges, earnedBadge] : prev.game.badges,
          highScores: {
            ...prev.game.highScores,
            kidArcadeBestScore: nextBest,
          },
        },
        auditLog: appendAuditLog(
          prev.auditLog,
          'Hoàn thành Game Kid Bé Hứng Sao',
          'Game World',
          `${result.score} điểm · ${result.starsCaught} sao (+${result.xpEarned} XP)`
        ),
      };
    });
  }, []);

  const handleLogMeditationMinutes = (minutes: number) => {
    setState((prev) => ({
      ...prev,
      meditationMinutesToday: prev.meditationMinutesToday + minutes,
      game: { ...prev.game, xp: prev.game.xp + 25 },
      auditLog: appendAuditLog(
        prev.auditLog,
        'Hoàn thành phiên thiền',
        'Meditation',
        `+${minutes} phút`
      ),
    }));
  };

  const handleAddMoodJournal = (entry: EncryptedMoodJournalEntry) => {
    setState((prev) => ({
      ...prev,
      moodJournals: [entry, ...prev.moodJournals],
      game: { ...prev.game, xp: prev.game.xp + 20 },
      auditLog: appendAuditLog(
        prev.auditLog,
        'Lưu nhật ký cảm xúc mã hóa',
        'Security',
        `${entry.encryptedEnvelope?.algorithm || 'AES-GCM-256'} · Mood ${entry.moodScore}/5`
      ),
    }));
    if (auth.currentUser) {
      void pushEncryptedJournalToCloud(entry).catch(() => {
        // non-blocking cloud sync
      });
    }
  };

  const handleUpdateProfile = (patch: Partial<UserPersonalProfile>) => {
    setState((prev) => ({
      ...prev,
      profile: { ...prev.profile, ...patch },
    }));
  };

  const handleUpdatePermissions = (patch: Partial<UserPermissions>) => {
    const entries = Object.entries(patch)
      .map(([k, v]) => `${k}: ${v ? 'Bật' : 'Tắt'}`)
      .join(', ');
    setState((prev) => ({
      ...prev,
      permissions: { ...prev.permissions, ...patch },
      auditLog: appendAuditLog(prev.auditLog, 'Thay đổi quyền truy cập', 'Privacy', entries),
    }));
  };

  const handleSyncCloudNow = async () => {
    if (!auth.currentUser) return;
    setSyncState('syncing');
    try {
      await pushWellnessSyncToCloud(state, levelInfo.level);
      for (const entry of state.moodJournals.slice(0, 10)) {
        await pushEncryptedJournalToCloud(entry);
      }
      setSyncState('synced');
      setState((prev) => ({
        ...prev,
        auditLog: appendAuditLog(prev.auditLog, 'Đồng bộ dữ liệu lên Cloud', 'Firestore', 'Thành công'),
      }));
    } catch {
      setSyncState('error');
    }
  };

  const handlePullCloudNow = async () => {
    if (!auth.currentUser) return;
    setSyncState('syncing');
    try {
      const remote = await pullWellnessSyncFromCloud();
      const remoteJournals = await listEncryptedJournalsFromCloud();
      skipNextAutoPushRef.current = true;
      setState((prev) => ({
        ...prev,
        ...(remote || {}),
        moodJournals: remoteJournals.length > 0 ? remoteJournals : prev.moodJournals,
        auditLog: appendAuditLog(prev.auditLog, 'Khôi phục dữ liệu từ Cloud', 'Firestore', 'Hoàn tất'),
      }));
      setSyncState('synced');
    } catch {
      setSyncState('error');
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexalife-os-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setState((prev) => ({
      ...prev,
      auditLog: appendAuditLog(prev.auditLog, 'Xuất bản sao lưu JSON', 'Privacy', 'Tải về thiết bị'),
    }));
  };

  const handleDeleteAllData = async () => {
    if (auth.currentUser) {
      try {
        await deleteCloudUserData();
      } catch {
        // ignore if cloud doc missing
      }
    }
    const fresh = clearAllPersistedData();
    setState(fresh);
  };

  const handleLogSecurityAction = (action: string, detail: string) => {
    setState((prev) => ({
      ...prev,
      auditLog: appendAuditLog(prev.auditLog, action, 'Security', detail),
    }));
  };

  return (
    <div
      data-module={activeModule}
      className="min-h-screen alw-ambient-canvas text-zinc-900 dark:text-zinc-100 flex"
    >
      <SidebarNav
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        uiLang={uiLang}
        xp={state.game.xp}
        level={levelInfo.level}
        streakDays={state.streakDays}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader
          activeModule={activeModule}
          onSelectModule={setActiveModule}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          uiLang={uiLang}
          onToggleUiLang={handleToggleUiLang}
          displayName={state.profile.displayName}
          isSignedIn={Boolean(authUser)}
          authUser={authUser}
          authBusy={authBusy}
          syncState={syncState}
          musicPlaying={musicState.isPlaying || Boolean(activeExternalStream)}
          musicGenreBadge={
            activeExternalStream
              ? activeExternalStream.provider === 'youtube'
                ? 'YouTube'
                : 'Spotify'
              : MUSIC_GENRE_META[musicState.currentTrack.genre].badgeLabel
          }
          onOpenMusicStudio={() => {
            setMusicStudioTab(activeExternalStream ? activeExternalStream.provider : 'studio');
            setMusicModalOpen(true);
          }}
          onGoogleSignIn={() => void handleGoogleSignIn()}
          onOpenSecurityProfile={() => setProfileModalOpen(true)}
          onLaunchKidGame={() => setKidGameOpen(true)}
        />

        {authNotice && (
          <div className="mx-auto mt-3 flex w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-orange-500/40 bg-[#13151C]/95 px-4 py-2.5 text-xs text-orange-100 shadow-lg">
              <span>{authNotice}</span>
              <button
                type="button"
                onClick={() => setAuthNotice(null)}
                aria-label="Đóng thông báo"
                className="rounded p-1 hover:bg-zinc-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 pb-20 sm:px-6 lg:pb-8">
          <ModuleSoundtrackBar
            activeModule={activeModule}
            musicState={musicState}
            activeExternalStream={activeExternalStream}
            onStopExternalStream={() => setActiveExternalStream(null)}
            onOpenMusicStudio={(tab = 'studio') => {
              setMusicStudioTab(tab);
              setMusicModalOpen(true);
            }}
          />

          {activeModule === 'dashboard' && (
            <DashboardView
              state={state}
              uiLang={uiLang}
              aiConfigured={aiConfigured}
              musicState={musicState}
              onOpenMusicStudio={() => {
                setMusicStudioTab('studio');
                setMusicModalOpen(true);
              }}
              onNavigate={setActiveModule}
              onAddWater={handleAddWater}
              onAddSteps={handleAddSteps}
              onToggleHabit={handleToggleHabit}
              onLaunchKidGame={() => setKidGameOpen(true)}
            />
          )}

          {activeModule === 'timer' && (
            <SmartTimerView
              schedules={state.schedules}
              wakeTime={state.profile.wakeTime}
              sleepTime={state.profile.sleepTime}
              aiVoiceGender={state.profile.aiVoiceGender || 'female'}
              vietnameseRegion={state.profile.vietnameseRegion || 'north'}
              onAddSchedule={handleAddSchedule}
              onToggleSchedule={handleToggleSchedule}
              onDeleteSchedule={handleDeleteSchedule}
              onUpdateSleepSchedule={handleUpdateSleepSchedule}
              onCompleteSession={handleCompleteTimerSession}
            />
          )}

          {activeModule === 'fitness' && (
            <HomeFitnessView
              weightKg={state.profile.weightKg}
              cameraAllowed={state.permissions.camera}
              workouts={state.workouts}
              claudeConfigured={claudeConfigured}
              aiVoiceGender={state.profile.aiVoiceGender || 'female'}
              vietnameseRegion={state.profile.vietnameseRegion || 'north'}
              isWorkoutMusicPlaying={
                musicState.isPlaying && musicState.currentTrack.genre === 'phonk'
              }
              onPlayWorkoutMusic={() => {
                if (musicState.isPlaying && musicState.currentTrack.genre === 'phonk') {
                  musicEngine.stop();
                } else {
                  musicEngine.playGenre('phonk');
                }
              }}
              onOpenMusicStudio={() => setMusicModalOpen(true)}
              onChangeVoiceGender={(gender) =>
                handleUpdateProfile({
                  aiVoiceGender: gender,
                  aiVoiceName: gender === 'male' ? 'Charon' : 'Kore',
                })
              }
              onGrantCameraPermission={() => handleUpdatePermissions({ camera: true })}
              onLogWorkout={handleLogWorkout}
            />
          )}

          {activeModule === 'nutrition' && (
            <NutritionAndFoodView
              profile={state.profile}
              meals={state.meals}
              waterMlToday={state.waterMlToday}
              workoutCaloriesBurned={workoutCaloriesBurned}
              onAddWater={handleAddWater}
              onAddMeal={handleAddMeal}
              onDeleteMeal={handleDeleteMeal}
            />
          )}

          {activeModule === 'languages' && (
            <LanguageHubView
              targetLanguageCode={state.profile.targetLanguageCode}
              userLevel={state.profile.languageLevel}
              lessonsCompleted={state.languageLessonsCompleted}
              aiVoiceName={state.profile.aiVoiceName}
              aiVoiceGender={state.profile.aiVoiceGender || 'female'}
              vietnameseRegion={state.profile.vietnameseRegion || 'north'}
              isStudyMusicPlaying={
                musicState.isPlaying && musicState.currentTrack.genre === 'lofi'
              }
              onPlayStudyMusic={() => {
                if (musicState.isPlaying && musicState.currentTrack.genre === 'lofi') {
                  musicEngine.stop();
                } else {
                  musicEngine.playGenre('lofi');
                }
              }}
              onChangeTargetLanguage={(code) => handleUpdateProfile({ targetLanguageCode: code })}
              onChangeVoiceGender={(gender) =>
                handleUpdateProfile({
                  aiVoiceGender: gender,
                  aiVoiceName: gender === 'male' ? 'Charon' : 'Kore',
                })
              }
              onUpdateLevel={(lv: CefrLevel) => handleUpdateProfile({ languageLevel: lv })}
              onCompleteLesson={handleCompleteLanguageLesson}
              onOpenEnglishGameArena={() => setActiveModule('games')}
            />
          )}

          {activeModule === 'games' && (
            <GameWorldView
              displayName={state.profile.displayName}
              streakDays={state.streakDays}
              game={state.game}
              userLevel={state.profile.languageLevel}
              fitnessGoal={state.profile.goal}
              workoutsCount={state.workouts.length}
              aiConfigured={aiConfigured}
              claudeConfigured={claudeConfigured}
              aiVoiceGender={state.profile.aiVoiceGender || 'female'}
              onAddXp={handleAddXp}
              onUpdateHighScore={handleUpdateHighScore}
              onUpdateAvatar={handleUpdateAvatar}
              onLaunchKidGame={() => setKidGameOpen(true)}
              onNavigateToLanguages={() => setActiveModule('languages')}
            />
          )}

          {activeModule === 'meditation' && (
            <MeditationWellnessView
              uiLang={uiLang}
              meditationMinutesToday={state.meditationMinutesToday}
              habits={state.habits}
              moodJournals={state.moodJournals}
              onLogMeditationMinutes={handleLogMeditationMinutes}
              onToggleHabit={handleToggleHabit}
              onAddHabit={handleAddHabit}
              onDeleteHabit={handleDeleteHabit}
              onAddMoodJournal={handleAddMoodJournal}
            />
          )}

          {activeModule === 'assistant' && (
            <AiAssistantView
              state={state}
              uiLang={uiLang}
              aiConfigured={aiConfigured}
              claudeConfigured={claudeConfigured}
              onToggleAiPersonalData={() =>
                handleUpdatePermissions({
                  allowAiPersonalData: !state.permissions.allowAiPersonalData,
                })
              }
              onGrantMicrophone={() => handleUpdatePermissions({ microphone: true })}
              onOpenSecurityProfile={() => setProfileModalOpen(true)}
            />
          )}
        </main>
      </div>

      <ProfileSecurityModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        state={state}
        authUser={authUser}
        dbStatus={dbStatus}
        onUpdateProfile={handleUpdateProfile}
        onUpdatePermissions={handleUpdatePermissions}
        onSyncCloudNow={handleSyncCloudNow}
        onPullCloudNow={handlePullCloudNow}
        onExportJson={handleExportJson}
        onDeleteAllData={handleDeleteAllData}
        onLogSecurityAction={handleLogSecurityAction}
      />

      <KidStarGameShell
        open={kidGameOpen}
        bestScore={state.game.highScores.kidArcadeBestScore}
        companionName={state.game.avatarStyle.companionName}
        suitColor={state.game.avatarStyle.suitColor}
        onClose={() => setKidGameOpen(false)}
        onFinishRound={handleFinishKidGameRound}
      />

      <MusicStudioModal
        open={musicModalOpen}
        initialTab={musicStudioTab}
        activeModule={activeModule}
        musicState={musicState}
        activeExternalStream={activeExternalStream}
        onSelectExternalStream={setActiveExternalStream}
        onClose={() => setMusicModalOpen(false)}
      />

      {/* Docked External YouTube / Spotify Mini Player when Music Studio is closed */}
      {activeExternalStream && !musicModalOpen && (
        <div
          className="fixed bottom-20 right-4 z-40 w-72 sm:w-80 overflow-hidden rounded-xl border border-zinc-700/80 bg-[#0D0F14]/95 shadow-2xl backdrop-blur-md lg:bottom-4"
          aria-label="Trình phát YouTube Spotify thu gọn"
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                setMusicStudioTab(activeExternalStream.provider);
                setMusicModalOpen(true);
              }}
              className="min-w-0 flex-1 text-left"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#FF6B1A]">
                {activeExternalStream.provider === 'youtube' ? 'YouTube Đang phát' : 'Spotify Đang phát'}
              </div>
              <div className="truncate text-xs font-bold text-white">
                {activeExternalStream.title}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setActiveExternalStream(null)}
              aria-label="Đóng trình phát thu gọn"
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <iframe
            title={activeExternalStream.title}
            src={activeExternalStream.embedUrl}
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className={`w-full border-0 ${
              activeExternalStream.provider === 'youtube' ? 'h-36' : 'h-[80px]'
            }`}
          />
        </div>
      )}
    </div>
  );
}

export default App;
