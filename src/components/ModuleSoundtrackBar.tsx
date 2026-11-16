import React from 'react';
import { Music2, Pause, Play, Radio, SlidersHorizontal, Youtube } from 'lucide-react';
import {
  MUSIC_GENRE_META,
  MUSIC_GENRE_ORDER,
  getDefaultTrackForGenre,
  getRecommendedGenreForModule,
} from '../data/musicTracks';
import type { AppModuleId } from '../types/lifeworld';
import { musicEngine, type MusicPlayerSnapshot } from '../utils/musicEngine';
import type { ActiveExternalMusicStream, MusicStudioSourceTab } from './MusicStudioModal';

interface ModuleSoundtrackBarProps {
  activeModule: AppModuleId;
  musicState: MusicPlayerSnapshot;
  activeExternalStream: ActiveExternalMusicStream | null;
  onStopExternalStream: () => void;
  onOpenMusicStudio: (tab?: MusicStudioSourceTab) => void;
}

export const ModuleSoundtrackBar: React.FC<ModuleSoundtrackBarProps> = ({
  activeModule,
  musicState,
  activeExternalStream,
  onStopExternalStream,
  onOpenMusicStudio,
}) => {
  const recommendedGenre = getRecommendedGenreForModule(activeModule);
  const recommendedMeta = MUSIC_GENRE_META[recommendedGenre];
  const recommendedTrack = getDefaultTrackForGenre(recommendedGenre);

  const isPlayingRecommended =
    !activeExternalStream &&
    musicState.isPlaying &&
    musicState.currentTrack.genre === recommendedGenre;

  return (
    <section
      aria-label="Âm nhạc đồng hành theo phân khu"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200/90 bg-white/95 px-4 py-2.5 backdrop-blur-md dark:border-zinc-800/90 dark:bg-[#13151C]/95"
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => {
            onStopExternalStream();
            if (isPlayingRecommended) {
              musicEngine.togglePlay();
            } else {
              musicEngine.playGenre(recommendedGenre);
            }
          }}
          className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
            musicState.isPlaying && !activeExternalStream
              ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
              : 'bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-950'
          }`}
        >
          {musicState.isPlaying && !activeExternalStream ? (
            <>
              <Pause className="h-3.5 w-3.5" />
              <span>Tạm dừng nhạc</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              <span>Phát {recommendedMeta.badgeLabel}</span>
            </>
          )}
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 truncate dark:text-zinc-100">
            <Music2 className="h-3.5 w-3.5 shrink-0 text-orange-600 dark:text-[#FF6B1A]" />
            <span className="truncate">
              {activeExternalStream
                ? `Đang phát ${activeExternalStream.provider === 'youtube' ? 'YouTube' : 'Spotify'}: ${activeExternalStream.title}`
                : musicState.isPlaying
                  ? `${musicState.currentTrack.title} · ${musicState.currentTrack.bpm} BPM`
                  : `Đề xuất: ${recommendedTrack.title} (${recommendedMeta.labelVi})`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {MUSIC_GENRE_ORDER.map((genre) => {
          const active =
            !activeExternalStream && musicState.isPlaying && musicState.currentTrack.genre === genre;
          return (
            <button
              key={genre}
              type="button"
              onClick={() => {
                onStopExternalStream();
                musicEngine.playGenre(genre);
              }}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                  : 'border border-stone-200 text-zinc-600 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
              }`}
            >
              {MUSIC_GENRE_META[genre].badgeLabel}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => onOpenMusicStudio('youtube')}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
            activeExternalStream?.provider === 'youtube'
              ? 'border-rose-400 bg-rose-500 text-white'
              : 'border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300'
          }`}
        >
          <Youtube className="h-3 w-3" />
          <span>YouTube</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenMusicStudio('spotify')}
          className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
            activeExternalStream?.provider === 'spotify'
              ? 'border-emerald-400 bg-emerald-500 text-zinc-950'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300'
          }`}
        >
          <Radio className="h-3 w-3" />
          <span>Spotify</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenMusicStudio('studio')}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-300/90 px-2.5 py-1 text-[11px] font-medium text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800 whitespace-nowrap"
        >
          <SlidersHorizontal className="h-3 w-3" />
          <span>Studio</span>
        </button>
      </div>
    </section>
  );
};
