import React from 'react';
import {
  Activity,
  Apple,
  Bot,
  Clock,
  Gamepad2,
  Globe2,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react';
import type { AppModuleId, UiLanguage } from '../types/lifeworld';

interface SidebarNavProps {
  activeModule: AppModuleId;
  onSelectModule: (id: AppModuleId) => void;
  uiLang: UiLanguage;
  xp: number;
  level: number;
  streakDays: number;
}

type ModuleGroupKey = 'core' | 'body' | 'mind' | 'coach';

export const MODULE_ITEMS: Array<{
  id: AppModuleId;
  group: ModuleGroupKey;
  labelVi: string;
  labelEn: string;
  mobileLabelVi: string;
  mobileLabelEn: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', group: 'core', labelVi: 'Tổng quan', labelEn: 'Cockpit', mobileLabelVi: 'Nhà', mobileLabelEn: 'Home', icon: LayoutDashboard },
  { id: 'timer', group: 'body', labelVi: 'Đồng hồ', labelEn: 'Smart Timer', mobileLabelVi: 'Giờ', mobileLabelEn: 'Timer', icon: Clock },
  { id: 'fitness', group: 'body', labelVi: 'Thể dục', labelEn: 'Fitness', mobileLabelVi: 'Tập', mobileLabelEn: 'Fit', icon: Activity },
  { id: 'nutrition', group: 'body', labelVi: 'Dinh dưỡng', labelEn: 'Nutrition', mobileLabelVi: 'Ăn', mobileLabelEn: 'Food', icon: Apple },
  { id: 'languages', group: 'mind', labelVi: 'Ngoại ngữ', labelEn: 'Languages', mobileLabelVi: 'Ngữ', mobileLabelEn: 'Lang', icon: Globe2 },
  { id: 'games', group: 'mind', labelVi: 'Trò chơi', labelEn: 'Game World', mobileLabelVi: 'Game', mobileLabelEn: 'Game', icon: Gamepad2 },
  { id: 'meditation', group: 'mind', labelVi: 'Thiền định', labelEn: 'Meditation', mobileLabelVi: 'Thiền', mobileLabelEn: 'Zen', icon: Sparkles },
  { id: 'assistant', group: 'coach', labelVi: 'Trợ lý AI', labelEn: 'AI Coach', mobileLabelVi: 'AI', mobileLabelEn: 'AI', icon: Bot },
];

const NAV_GROUPS: Array<{ key: ModuleGroupKey; titleVi: string; titleEn: string }> = [
  { key: 'core', titleVi: 'Trung tâm', titleEn: 'Command' },
  { key: 'body', titleVi: 'Thể chất & Nhiên liệu', titleEn: 'Body & Fuel' },
  { key: 'mind', titleVi: 'Trí tuệ & Phục hồi', titleEn: 'Mind & Recovery' },
  { key: 'coach', titleVi: 'Trợ lý Chuyên gia', titleEn: 'AI Coach' },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeModule,
  onSelectModule,
  uiLang,
  xp,
  level,
  streakDays,
}) => {
  return (
    <>
      {/* Desktop Sidebar */}
      <aside
        aria-label={uiLang === 'vi' ? 'Điều hướng chính' : 'Primary Navigation'}
        className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:border-r lg:border-stone-200/90 lg:bg-white/95 lg:dark:border-zinc-800/90 lg:dark:bg-[#0D0F14]/95"
      >
        <div className="flex h-16 items-center border-b border-stone-200/90 px-5 dark:border-zinc-800/90">
          <button
            type="button"
            onClick={() => onSelectModule('dashboard')}
            className="flex items-center gap-2.5 font-display text-lg font-extrabold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 dark:text-zinc-100"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF6B1A] to-amber-500 font-display text-xs font-extrabold tracking-tighter text-zinc-950 shadow-sm">
              NX
            </span>
            <span>
              NexaLife <span className="text-orange-600 dark:text-[#FF6B1A]">OS</span>
            </span>
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto p-4">
          {NAV_GROUPS.map((grp) => {
            const items = MODULE_ITEMS.filter((item) => item.group === grp.key);
            return (
              <div key={grp.key} className="space-y-1">
                <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
                  {uiLang === 'vi' ? grp.titleVi : grp.titleEn}
                </div>
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = activeModule === item.id;
                  const label = uiLang === 'vi' ? item.labelVi : item.labelEn;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectModule(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-orange-600 text-white shadow-sm dark:bg-[#FF6B1A] dark:text-zinc-950'
                          : 'text-zinc-600 hover:bg-stone-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-[#13151C] dark:hover:text-white'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-stone-200/90 p-4 dark:border-zinc-800/90">
          <div className="rounded-lg border border-stone-200/90 bg-stone-50 p-3.5 dark:border-zinc-800 dark:bg-[#13151C]">
            <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {uiLang === 'vi' ? 'Tiến độ cá nhân' : 'Personal Progress'}
            </div>
            <div className="mt-1.5 flex items-baseline justify-between">
              <span className="font-mono text-base font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
                Lv.{level}
              </span>
              <span className="font-mono text-xs font-semibold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                {xp} XP · {streakDays}d
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Compact Bottom Tab Bar (opaque, capped well under 15% mobile height) */}
      <nav
        aria-label={uiLang === 'vi' ? 'Thanh điều hướng di động' : 'Mobile Navigation'}
        className="fixed inset-x-0 bottom-0 z-40 flex h-14 items-center justify-around border-t border-stone-200/90 bg-white/95 px-1 lg:hidden dark:border-zinc-800 dark:bg-[#0D0F14]/95"
      >
        {MODULE_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeModule === item.id;
          const fullLabel = uiLang === 'vi' ? item.labelVi : item.labelEn;
          const shortLabel = uiLang === 'vi' ? item.mobileLabelVi : item.mobileLabelEn;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectModule(item.id)}
              aria-label={fullLabel}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-1 text-[10px] font-medium transition-colors ${
                active
                  ? 'text-orange-600 dark:text-[#FF6B1A]'
                  : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="whitespace-nowrap">{shortLabel}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
