import React from 'react';
import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Circle,
  Clock,
  Droplets,
  Flame,
  Footprints,
  Gamepad2,
  Moon,
  Music2,
  Sparkles,
} from 'lucide-react';
import type { AppModuleId, AppPersistentState, UiLanguage } from '../types/lifeworld';
import {
  calculateMacroTargets,
  calculateTdeeAndTarget,
  sumDailyNutrition,
} from '../utils/healthEngine';
import { computeLevelFromXp } from '../utils/gameEngine';
import type { MusicPlayerSnapshot } from '../utils/musicEngine';

interface DashboardViewProps {
  state: AppPersistentState;
  uiLang: UiLanguage;
  aiConfigured: boolean;
  musicState?: MusicPlayerSnapshot;
  onOpenMusicStudio?: () => void;
  onNavigate: (mod: AppModuleId) => void;
  onAddWater: (ml: number) => void;
  onAddSteps: (steps: number) => void;
  onToggleHabit: (habitId: string) => void;
  onLaunchKidGame: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  uiLang,
  aiConfigured,
  musicState,
  onOpenMusicStudio,
  onNavigate,
  onAddWater,
  onAddSteps,
  onToggleHabit,
  onLaunchKidGame,
}) => {
  const { tdee, targetCalories } = calculateTdeeAndTarget(state.profile);
  const macros = calculateMacroTargets(targetCalories, state.profile.goal, state.profile.weightKg);
  const intake = sumDailyNutrition(state.meals);
  const workoutMinutes = state.workouts.reduce((sum, w) => sum + w.durationMinutes, 0);
  const workoutCalories = state.workouts.reduce((sum, w) => sum + w.caloriesBurned, 0);
  const levelInfo = computeLevelFromXp(state.game.xp);

  // Weekly deterministic activity trend blended with today's live logs
  const weeklyTrend = [
    { day: 'T2', kcalIn: 1840, kcalBurn: 320, studyMin: 25 },
    { day: 'T3', kcalIn: 1920, kcalBurn: 410, studyMin: 35 },
    { day: 'T4', kcalIn: 1790, kcalBurn: 280, studyMin: 20 },
    { day: 'T5', kcalIn: 2010, kcalBurn: 490, studyMin: 40 },
    { day: 'T6', kcalIn: 1880, kcalBurn: 360, studyMin: 30 },
    { day: 'T7', kcalIn: 1950, kcalBurn: 440, studyMin: 45 },
    {
      day: uiLang === 'vi' ? 'Nay' : 'Now',
      kcalIn: Math.max(200, intake.calories),
      kcalBurn: Math.max(60, workoutCalories),
      studyMin: state.languageLessonsCompleted * 8 + state.meditationMinutesToday,
    },
  ];
  const maxTrendVal = Math.max(2200, ...weeklyTrend.map((d) => d.kcalIn));

  return (
    <div className="space-y-6">
      {/* NexaLife OS Readiness & Performance Command Hero */}
      <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-[#0D0F14] shadow-lg">
        <div className="grid lg:grid-cols-12 items-stretch">
          <div className="relative z-10 flex flex-col justify-between p-6 sm:p-8 lg:col-span-7">
            <div>
              <p className="text-xs font-semibold tracking-wide text-orange-400">
                {uiLang === 'vi'
                  ? `Xin chào, ${state.profile.displayName} · Chuỗi ${state.streakDays} ngày duy trì · Cấp ${levelInfo.level}`
                  : `Welcome, ${state.profile.displayName} · ${state.streakDays}-day streak · Level ${levelInfo.level}`}
              </p>
              <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl [text-wrap:balance]">
                {uiLang === 'vi'
                  ? 'NexaLife OS — Trung tâm Sống Khỏe, Thể thao & Học tập Toàn diện'
                  : 'NexaLife OS — Performance Cockpit for Health, Training & Learning'}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-300">
                {uiLang === 'vi'
                  ? `Mục tiêu hôm nay: ${targetCalories} kcal nạp vào · ${state.profile.dailyWorkoutMinutes} phút vận động · ${state.profile.dailyWaterGoalMl} ml nước. ${
                      aiConfigured
                        ? 'Hệ thống AI Gemini đã sẵn sàng phân tích và đồng hành.'
                        : 'Chế độ dữ liệu cục bộ đang hoạt động; kết nối GEMINI_API_KEY để mở khóa AI phân tích chuyên sâu.'
                    }`
                  : `Today's target: ${targetCalories} kcal · ${state.profile.dailyWorkoutMinutes} min training · ${state.profile.dailyWaterGoalMl} ml hydration.`}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => onNavigate('assistant')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#FF6B1A] px-3.5 py-2.5 text-sm font-bold text-zinc-950 hover:bg-[#ff7f38] transition-colors whitespace-nowrap shrink-0"
              >
                <Bot className="h-4 w-4" />
                <span>{uiLang === 'vi' ? 'Hỏi Trợ lý AI' : 'Ask AI Coach'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('fitness')}
                className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-3.5 py-2.5 text-sm font-medium text-white hover:bg-white/20 transition-colors whitespace-nowrap shrink-0"
              >
                <span>{uiLang === 'vi' ? 'Tập luyện 60fps' : '60fps Workout'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onLaunchKidGame}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/15 px-3.5 py-2.5 text-sm font-semibold text-amber-200 hover:bg-amber-400/25 transition-colors whitespace-nowrap shrink-0"
              >
                <Gamepad2 className="h-4 w-4" />
                <span>{uiLang === 'vi' ? 'Game Kid' : 'Kid Game'}</span>
              </button>
              {onOpenMusicStudio && (
                <button
                  type="button"
                  onClick={onOpenMusicStudio}
                  className="inline-flex items-center gap-2 rounded-lg border border-zinc-600/80 bg-[#13151C] px-3.5 py-2.5 text-sm font-semibold text-zinc-100 hover:border-orange-400/70 transition-colors whitespace-nowrap shrink-0"
                >
                  <Music2 className="h-4 w-4 text-[#FF6B1A]" />
                  <span>
                    {musicState?.isPlaying
                      ? musicState.currentTrack.title
                      : uiLang === 'vi'
                        ? 'Studio Nhạc'
                        : 'Music Studio'}
                  </span>
                </button>
              )}
            </div>
          </div>

          <div className="relative min-h-[220px] lg:col-span-5">
            <img
              src="/src/assets/images/nexalife_cockpit_hero_1794823888200.jpg"
              alt="NexaLife OS Performance Cockpit"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0D0F14] via-[#0D0F14]/45 to-transparent lg:bg-gradient-to-r" />
          </div>
        </div>
      </section>

      {/* 4-Column Primary Health KPI Strip */}
      <section aria-label="Personal Health Metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-stone-200/90 bg-white/95 p-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>{uiLang === 'vi' ? 'Số bước & Vận động' : 'Steps & Active Time'}</span>
            <Footprints className="h-4 w-4 text-orange-600 dark:text-[#FF6B1A]" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
              {state.stepsToday.toLocaleString('vi-VN')}
            </span>
            <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              / {state.profile.dailyStepGoal.toLocaleString('vi-VN')}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-zinc-600 dark:text-zinc-300">
            <span className="tabular-nums">{workoutMinutes} phút tập · {workoutCalories} kcal tiêu hao</span>
            <button
              type="button"
              onClick={() => onAddSteps(500)}
              className="font-semibold text-orange-600 hover:underline dark:text-[#FF6B1A]"
            >
              +500
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200/90 bg-white/95 p-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>{uiLang === 'vi' ? 'Năng lượng (Nạp / Mục tiêu)' : 'Calories (In / Target)'}</span>
            <Flame className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
              {intake.calories}
            </span>
            <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              / {targetCalories} kcal
            </span>
          </div>
          <div className="mt-3 text-xs text-zinc-600 tabular-nums dark:text-zinc-300">
            Đạm {intake.proteinG}g / {macros.proteinG}g · TDEE {tdee} kcal
          </div>
        </div>

        <div className="rounded-xl border border-stone-200/90 bg-white/95 p-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>{uiLang === 'vi' ? 'Nước uống hôm nay' : 'Hydration Today'}</span>
            <Droplets className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
              {state.waterMlToday} ml
            </span>
            <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              / {state.profile.dailyWaterGoalMl} ml
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-zinc-600 tabular-nums dark:text-zinc-300">
              {Math.min(100, Math.round((state.waterMlToday / state.profile.dailyWaterGoalMl) * 100))}% mục tiêu
            </span>
            <button
              type="button"
              onClick={() => onAddWater(250)}
              className="font-semibold text-sky-600 hover:underline dark:text-sky-400"
            >
              +250 ml
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200/90 bg-white/95 p-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex items-center justify-between text-xs font-medium text-zinc-500 dark:text-zinc-400">
            <span>{uiLang === 'vi' ? 'Giấc ngủ, Thiền & Học tập' : 'Sleep, Mind & Study'}</span>
            <Moon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-2xl font-bold text-zinc-900 tabular-nums dark:text-zinc-100">
              {state.sleepHoursLastNight}h
            </span>
            <span className="font-mono text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
              Thiền {state.meditationMinutesToday}p
            </span>
          </div>
          <div className="mt-3 text-xs text-zinc-600 tabular-nums dark:text-zinc-300">
            Ngoại ngữ: {state.languageLessonsCompleted} bài · Ngủ dự kiến {state.profile.sleepTime}
          </div>
        </div>
      </section>

      {/* Main Split: 7-Day Progress Chart & Daily Habits/Schedule */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-7 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {uiLang === 'vi' ? 'Biểu đồ Năng lượng & Vận động 7 Ngày' : '7-Day Energy & Activity Report'}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Calo nạp (cam năng lượng) · Calo tiêu hao tập luyện (vàng hổ phách) · Đơn vị kcal
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('nutrition')}
              className="text-xs font-semibold text-orange-600 hover:underline dark:text-[#FF6B1A]"
            >
              {uiLang === 'vi' ? 'Mở nhật ký dinh dưỡng' : 'Open Nutrition Log'}
            </button>
          </div>

          <div className="mt-6">
            <svg
              viewBox="0 0 640 210"
              role="img"
              aria-label="Biểu đồ cột năng lượng 7 ngày"
              className="h-52 w-full"
            >
              {[0, 0.5, 1].map((ratio) => {
                const y = 170 - ratio * 140;
                const val = Math.round(maxTrendVal * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1="45"
                      y1={y}
                      x2="620"
                      y2={y}
                      stroke="currentColor"
                      className="text-stone-200 dark:text-zinc-800"
                      strokeDasharray="3 3"
                    />
                    <text x="4" y={y + 4} className="fill-zinc-400 font-mono text-[10px]">
                      {val}
                    </text>
                  </g>
                );
              })}

              {weeklyTrend.map((d, idx) => {
                const groupX = 72 + idx * 80;
                const inHeight = Math.max(8, (d.kcalIn / maxTrendVal) * 140);
                const burnHeight = Math.max(6, (d.kcalBurn / maxTrendVal) * 140);
                return (
                  <g key={d.day}>
                    <rect
                      x={groupX}
                      y={170 - inHeight}
                      width="20"
                      height={inHeight}
                      rx="4"
                      className="fill-orange-600 dark:fill-[#FF6B1A]"
                    />
                    <rect
                      x={groupX + 24}
                      y={170 - burnHeight}
                      width="16"
                      height={burnHeight}
                      rx="4"
                      className="fill-amber-400 dark:fill-amber-400"
                    />
                    <text
                      x={groupX + 18}
                      y="194"
                      textAnchor="middle"
                      className="fill-zinc-600 font-sans text-[11px] font-medium dark:fill-zinc-400"
                    >
                      {d.day}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </section>

        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {uiLang === 'vi' ? 'Thói quen & Lịch trình Hôm nay' : 'Daily Habits & Schedule'}
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('timer')}
              className="text-xs font-semibold text-orange-600 hover:underline dark:text-[#FF6B1A]"
            >
              {uiLang === 'vi' ? 'Đặt lịch & Hẹn giờ' : 'Manage Timers'}
            </button>
          </div>

          <div className="mt-4 divide-y divide-stone-100 dark:divide-zinc-800">
            {state.habits.map((habit) => (
              <button
                key={habit.id}
                type="button"
                onClick={() => onToggleHabit(habit.id)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-stone-50 dark:hover:bg-zinc-800/50 rounded-md px-2 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {habit.completedToday ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-orange-600 dark:text-[#FF6B1A]" />
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-zinc-400" />
                  )}
                  <span
                    className={`truncate text-sm ${
                      habit.completedToday
                        ? 'text-zinc-400 line-through dark:text-zinc-500'
                        : 'text-zinc-800 dark:text-zinc-200'
                    }`}
                  >
                    {habit.title}
                  </span>
                </div>
                <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0 dark:text-zinc-400">
                  {habit.streak}d
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 border-t border-stone-200 pt-4 dark:border-zinc-800">
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {uiLang === 'vi' ? 'Nhắc nhở sắp tới' : 'Upcoming Reminders'}
            </div>
            <div className="mt-2 space-y-2">
              {state.schedules.slice(0, 3).map((sch) => (
                <div key={sch.id} className="flex items-center justify-between text-xs text-zinc-700 dark:text-zinc-300">
                  <span className="truncate">{sch.title}</span>
                  <span className="font-mono text-zinc-500 tabular-nums shrink-0 ml-2 dark:text-zinc-400">
                    {sch.time}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Quick Module Shortcuts */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => onNavigate('timer')}
          className="flex items-center justify-between rounded-xl border border-stone-200/90 bg-white/95 p-4 text-left hover:border-orange-500 transition-colors dark:border-zinc-800/90 dark:bg-[#13151C]/95 dark:hover:border-[#FF6B1A]"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <Clock className="h-4 w-4 text-orange-600 dark:text-[#FF6B1A]" />
              <span>Smart Timer & Pomodoro</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Bấm giờ, Pomodoro, nhắc uống nước & giấc ngủ
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('games')}
          className="flex items-center justify-between rounded-xl border border-stone-200/90 bg-white/95 p-4 text-left hover:border-orange-500 transition-colors dark:border-zinc-800/90 dark:bg-[#13151C]/95 dark:hover:border-[#FF6B1A]"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <Activity className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>AI Game World & 3D Explorer</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Trí nhớ, phản xạ, toán học, từ vựng & thế giới 3D
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-400 shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigate('meditation')}
          className="flex items-center justify-between rounded-xl border border-stone-200/90 bg-white/95 p-4 text-left hover:border-orange-500 transition-colors dark:border-zinc-800/90 dark:bg-[#13151C]/95 dark:hover:border-[#FF6B1A]"
        >
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <span>Thiền định & Nhật ký Mã hóa</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Âm thanh thiên nhiên, thở 4-7-8 & AES-256-GCM
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-400 shrink-0" />
        </button>
      </section>
    </div>
  );
};
