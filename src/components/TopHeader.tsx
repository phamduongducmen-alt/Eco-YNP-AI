import React, { useEffect, useState } from 'react';
import { Cloud, CheckCircle2, Loader2, Moon, Music2, ShieldCheck, Sun } from 'lucide-react';
import type { AppModuleId, ThemeMode, UiLanguage } from '../types/lifeworld';
import type { UnifiedAuthUser } from '../utils/firebase';
import { MODULE_ITEMS } from './SidebarNav';

interface TopHeaderProps {
  activeModule: AppModuleId;
  onSelectModule: (id: AppModuleId) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  uiLang: UiLanguage;
  onToggleUiLang: () => void;
  displayName: string;
  isSignedIn: boolean;
  authUser: UnifiedAuthUser | null;
  authBusy: boolean;
  syncState: 'idle' | 'syncing' | 'synced' | 'error';
  musicPlaying: boolean;
  musicGenreBadge: string;
  onOpenMusicStudio: () => void;
  onGoogleSignIn: () => void;
  onOpenSecurityProfile: () => void;
  onLaunchKidGame: () => void;
}

const GoogleGIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
    />
  </svg>
);

export const TopHeader: React.FC<TopHeaderProps> = ({
  activeModule,
  onSelectModule,
  theme,
  onToggleTheme,
  uiLang,
  onToggleUiLang,
  displayName,
  isSignedIn,
  authUser,
  authBusy,
  syncState,
  musicPlaying,
  musicGenreBadge,
  onOpenMusicStudio,
  onGoogleSignIn,
  onOpenSecurityProfile,
  onLaunchKidGame,
}) => {
  const [clockText, setClockText] = useState(() =>
    new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setClockText(new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }));
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  const currentMod = MODULE_ITEMS.find((m) => m.id === activeModule);
  const modLabel = currentMod ? (uiLang === 'vi' ? currentMod.labelVi : currentMod.labelEn) : 'Dashboard';
  const accountLabel = authUser?.displayName || displayName;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-1.5 border-b border-stone-200/90 bg-white/90 px-2.5 backdrop-blur-md sm:gap-3 sm:px-6 dark:border-zinc-800/90 dark:bg-[#0D0F14]/90">
      {/* Zone 1: Brand / Active Module */}
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="font-display text-sm font-extrabold tracking-tight text-zinc-900 whitespace-nowrap shrink-0 sm:text-base lg:hidden dark:text-zinc-100">
          NexaLife <span className="text-orange-600 dark:text-[#FF6B1A]">OS</span>
        </span>
        <span className="hidden text-sm font-semibold text-zinc-900 whitespace-nowrap shrink-0 lg:inline dark:text-zinc-100">
          {modLabel}
        </span>
        <span className="hidden text-xs text-zinc-400 sm:inline" aria-hidden="true">
          ·
        </span>
        <span className="hidden font-mono text-xs text-zinc-500 tabular-nums sm:inline dark:text-zinc-400">
          {clockText}
        </span>
      </div>

      {/* Zone 2: Concise Quick Links (Desktop) */}
      <nav
        aria-label={uiLang === 'vi' ? 'Truy cập nhanh' : 'Quick Links'}
        className="hidden xl:flex items-center gap-5 text-sm font-medium text-zinc-600 dark:text-zinc-300"
      >
        <button
          type="button"
          onClick={() => onSelectModule('fitness')}
          className="hover:text-orange-600 transition-colors whitespace-nowrap shrink-0 dark:hover:text-[#FF6B1A]"
        >
          {uiLang === 'vi' ? 'Tập luyện' : 'Workout'}
        </button>
        <button
          type="button"
          onClick={() => onSelectModule('nutrition')}
          className="hover:text-orange-600 transition-colors whitespace-nowrap shrink-0 dark:hover:text-[#FF6B1A]"
        >
          {uiLang === 'vi' ? 'Thực đơn' : 'Meals'}
        </button>
        <button
          type="button"
          onClick={onLaunchKidGame}
          className="text-amber-600 hover:text-amber-500 font-semibold transition-colors whitespace-nowrap shrink-0 dark:text-amber-400 dark:hover:text-amber-300"
        >
          {uiLang === 'vi' ? 'Game Kid' : 'Kid Game'}
        </button>
        <button
          type="button"
          onClick={() => onSelectModule('assistant')}
          className="hover:text-orange-600 transition-colors whitespace-nowrap shrink-0 dark:hover:text-[#FF6B1A]"
        >
          {uiLang === 'vi' ? 'Trợ lý AI' : 'AI Coach'}
        </button>
      </nav>

      {/* Zone 3: Controls + Music Studio + Google Sign-In / Cloud Profile */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenMusicStudio}
          aria-label={uiLang === 'vi' ? 'Mở Trình phát nhạc đa thể loại' : 'Open Music Studio'}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:h-9 sm:px-2.5 ${
            musicPlaying
              ? 'border-orange-500/60 bg-orange-500/15 text-orange-700 dark:bg-[#FF6B1A]/20 dark:text-orange-200'
              : 'border-stone-300/90 text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-[#13151C]'
          }`}
        >
          <Music2 className={`h-3.5 w-3.5 ${musicPlaying ? 'text-orange-500 dark:text-[#FF6B1A]' : ''}`} />
          <span className="hidden sm:inline">
            {musicPlaying ? musicGenreBadge : uiLang === 'vi' ? 'Nhạc' : 'Music'}
          </span>
        </button>

        <button
          type="button"
          onClick={onToggleUiLang}
          aria-label={uiLang === 'vi' ? 'Chuyển sang tiếng Anh' : 'Switch to Vietnamese'}
          className="rounded-lg border border-stone-300/90 px-1.5 py-1.5 text-[11px] font-medium text-zinc-700 hover:bg-stone-100 whitespace-nowrap shrink-0 sm:px-2.5 sm:py-2 sm:text-xs dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-[#13151C]"
        >
          {uiLang === 'vi' ? 'VI' : 'EN'}
        </button>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Chuyển giao diện sáng' : 'Chuyển giao diện tối'}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-300/90 text-zinc-700 hover:bg-stone-100 shrink-0 sm:h-9 sm:w-9 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-[#13151C]"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {!isSignedIn ? (
          <>
            <button
              type="button"
              onClick={onOpenSecurityProfile}
              aria-label={uiLang === 'vi' ? 'Hồ sơ & Bảo mật' : 'Profile & Security'}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-300/90 px-2 text-xs font-medium text-zinc-700 hover:bg-stone-100 whitespace-nowrap shrink-0 sm:h-9 sm:px-3 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-[#13151C]"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-orange-600 dark:text-[#FF6B1A]" />
              <span className="hidden sm:inline">{uiLang === 'vi' ? 'Hồ sơ' : 'Profile'}</span>
            </button>

            <button
              type="button"
              disabled={authBusy}
              onClick={onGoogleSignIn}
              className="inline-flex h-8 items-center gap-1 rounded-lg bg-zinc-900 px-2 text-[11px] font-semibold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-60 whitespace-nowrap shrink-0 sm:h-9 sm:gap-2 sm:px-3 sm:text-xs dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-100"
            >
              {authBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GoogleGIcon />}
              <span>
                {authBusy
                  ? uiLang === 'vi'
                    ? 'Đang mở...'
                    : 'Signing in...'
                  : uiLang === 'vi'
                    ? 'Đăng nhập Google'
                    : 'Google Sign In'}
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onOpenSecurityProfile}
            className="flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-orange-500/25 whitespace-nowrap shrink-0 dark:bg-[#FF6B1A]/20 dark:text-orange-100 dark:hover:bg-[#FF6B1A]/30"
          >
            {authUser?.photoUrl ? (
              <img
                src={authUser.photoUrl}
                alt={accountLabel}
                referrerPolicy="no-referrer"
                className="h-6 w-6 rounded-full object-cover shrink-0"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF6B1A] font-mono text-[11px] font-bold text-zinc-950 shrink-0">
                {accountLabel.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="max-w-[100px] truncate">{accountLabel}</span>
            {syncState === 'syncing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#FF6B1A] shrink-0" />
            ) : syncState === 'synced' ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Cloud className="h-3.5 w-3.5 text-orange-500 shrink-0" />
            )}
          </button>
        )}
      </div>
    </header>
  );
};
