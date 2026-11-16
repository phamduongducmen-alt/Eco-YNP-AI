import React, { useEffect, useRef, useState } from 'react';
import {
  Disc3,
  Link2,
  Music2,
  Pause,
  Play,
  Radio,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Volume2,
  X,
  Youtube,
} from 'lucide-react';
import {
  MUSIC_GENRE_META,
  MUSIC_GENRE_ORDER,
  MUSIC_TRACKS,
  filterTracksByGenre,
  getRecommendedGenreForModule,
} from '../data/musicTracks';
import type { AppModuleId, MusicGenreId } from '../types/lifeworld';
import {
  CURATED_SPOTIFY_PLAYLISTS,
  CURATED_YOUTUBE_STREAMS,
  parseExternalMusicInput,
  type ExternalMusicProvider,
} from '../utils/externalMusic';
import { musicEngine, type MusicPlayerSnapshot } from '../utils/musicEngine';

export type MusicStudioSourceTab = 'studio' | 'youtube' | 'spotify';

export interface ActiveExternalMusicStream {
  provider: ExternalMusicProvider;
  title: string;
  subtitle: string;
  embedUrl: string;
  sourceUrl: string;
}

interface MusicStudioModalProps {
  open: boolean;
  initialTab?: MusicStudioSourceTab;
  activeModule: AppModuleId;
  musicState: MusicPlayerSnapshot;
  activeExternalStream: ActiveExternalMusicStream | null;
  onSelectExternalStream: (stream: ActiveExternalMusicStream | null) => void;
  onClose: () => void;
}

export const MusicStudioModal: React.FC<MusicStudioModalProps> = ({
  open,
  initialTab = 'studio',
  activeModule,
  musicState,
  activeExternalStream,
  onSelectExternalStream,
  onClose,
}) => {
  const [sourceTab, setSourceTab] = useState<MusicStudioSourceTab>(initialTab);
  const [selectedGenre, setSelectedGenre] = useState<'all' | MusicGenreId>('all');
  const [customUrlInput, setCustomUrlInput] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (open) {
      setSourceTab(initialTab);
      setUrlError(null);
    }
  }, [open, initialTab]);

  const recommendedGenre = getRecommendedGenreForModule(activeModule);
  const visibleTracks = filterTracksByGenre(selectedGenre);

  useEffect(() => {
    if (!open || sourceTab !== 'studio') return;

    const drawVisualizer = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const bars = musicEngine.getVisualizerBars(24);
      const gap = 4;
      const barW = (w - gap * (bars.length - 1)) / bars.length;

      bars.forEach((level, idx) => {
        const barH = Math.max(6, level * (h - 10));
        const x = idx * (barW + gap);
        const y = h - barH;
        const grad = ctx.createLinearGradient(0, y, 0, h);
        grad.addColorStop(0, '#ff6b1a');
        grad.addColorStop(0.55, '#f59e0b');
        grad.addColorStop(1, '#fb923c');
        ctx.fillStyle = musicState.isPlaying ? grad : 'rgba(113, 113, 122, 0.38)';
        ctx.fillRect(x, y, barW, barH);
      });
    };

    drawVisualizer();
    if (!musicState.isPlaying) return;

    const id = window.setInterval(drawVisualizer, 180);
    return () => window.clearInterval(id);
  }, [open, sourceTab, musicState.isPlaying]);

  if (!open) return null;

  const activeMeta = MUSIC_GENRE_META[musicState.currentTrack.genre];

  const handlePlayCuratedExternal = (stream: ActiveExternalMusicStream) => {
    musicEngine.stop();
    onSelectExternalStream(stream);
    setUrlError(null);
  };

  const handleCustomUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseExternalMusicInput(customUrlInput);
    if (!parsed) {
      setUrlError(
        sourceTab === 'spotify'
          ? 'Link Spotify chưa hợp lệ. Hãy dán link open.spotify.com/track|playlist|album/... hoặc spotify:playlist:...'
          : 'Link chưa hợp lệ. Hãy dán link YouTube (youtube.com/watch?v=..., youtu.be/..., music.youtube.com) hoặc link Spotify.'
      );
      return;
    }

    musicEngine.stop();
    const nextStream: ActiveExternalMusicStream = {
      provider: parsed.provider,
      title:
        parsed.provider === 'spotify'
          ? `Spotify ${parsed.resourceType.toUpperCase()} · Tùy chỉnh`
          : `YouTube ${parsed.resourceType === 'playlist' ? 'Playlist' : 'Stream'} · Tùy chỉnh`,
      subtitle: parsed.canonicalUrl,
      embedUrl: parsed.embedUrl,
      sourceUrl: parsed.canonicalUrl,
    };
    onSelectExternalStream(nextStream);
    setSourceTab(parsed.provider);
    setUrlError(null);
    setCustomUrlInput('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0B0E]/85 p-3 sm:p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="NexaLife OS Music Studio"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-[#0D0F14] text-zinc-100 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-[#FF6B1A]">
              <Disc3
                className={`h-5 w-5 ${musicState.isPlaying || activeExternalStream ? 'animate-spin' : ''}`}
              />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-white truncate">
                NexaLife OS Music Hub · Studio, YouTube & Spotify
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                {MUSIC_TRACKS.length} bản nhạc 8 thể loại tích hợp sẵn + phát trực tiếp YouTube, YT Music & Spotify
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng trình phát nhạc"
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 3-Source Switcher Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-[#0A0B0E] px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSourceTab('studio')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                sourceTab === 'studio'
                  ? 'bg-[#FF6B1A] text-zinc-950'
                  : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Music2 className="h-3.5 w-3.5" />
              <span>Studio Tích hợp ({MUSIC_TRACKS.length} bài)</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceTab('youtube')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                sourceTab === 'youtube'
                  ? 'bg-rose-500 text-white'
                  : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Youtube className="h-3.5 w-3.5" />
              <span>YouTube & YT Music</span>
            </button>

            <button
              type="button"
              onClick={() => setSourceTab('spotify')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                sourceTab === 'spotify'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Radio className="h-3.5 w-3.5" />
              <span>Spotify Player</span>
            </button>
          </div>

          {activeExternalStream && (
            <button
              type="button"
              onClick={() => onSelectExternalStream(null)}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 whitespace-nowrap"
            >
              <Square className="h-3 w-3" />
              <span>Dừng phát {activeExternalStream.provider === 'youtube' ? 'YouTube' : 'Spotify'}</span>
            </button>
          )}
        </div>

        {/* SOURCE TAB 1: BUILT-IN 26-TRACK 8-GENRE STUDIO */}
        {sourceTab === 'studio' && (
          <>
            <div className="border-b border-zinc-800 bg-gradient-to-br from-[#0A0B0E] via-[#13151C] to-[#0D0F14] px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`font-semibold ${activeMeta.accentClass}`}>
                      {activeMeta.labelVi}
                    </span>
                    <span className="text-zinc-500">·</span>
                    <span className="font-mono text-zinc-400 tabular-nums">
                      {musicState.currentTrack.bpm} BPM
                    </span>
                  </div>
                  <h3 className="mt-1 truncate font-display text-xl font-bold text-white">
                    {musicState.currentTrack.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {musicState.currentTrack.artistTag} — {musicState.currentTrack.moodVi}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectExternalStream(null);
                      musicEngine.prevTrack();
                    }}
                    aria-label="Bài trước"
                    className="rounded-lg border border-zinc-700 p-2 text-zinc-300 hover:bg-zinc-800"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectExternalStream(null);
                      musicEngine.togglePlay();
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FF6B1A] px-4 py-2.5 text-xs font-bold text-zinc-950 hover:bg-[#ff7f38] whitespace-nowrap"
                  >
                    {musicState.isPlaying ? (
                      <>
                        <Pause className="h-4 w-4" />
                        <span>Tạm dừng</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        <span>Phát nhạc</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectExternalStream(null);
                      musicEngine.nextTrack();
                    }}
                    aria-label="Bài tiếp theo"
                    className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
                <canvas
                  ref={canvasRef}
                  width={360}
                  height={40}
                  className="h-10 w-full max-w-sm rounded-lg bg-[#0A0B0E]/80 p-1"
                  aria-label="Biểu đồ sóng nhạc thời gian thực"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-zinc-300">
                    <Volume2 className="h-4 w-4 text-[#FF6B1A]" />
                    <input
                      type="range"
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={musicState.volume}
                      aria-label="Âm lượng trình phát nhạc"
                      onChange={(e) => musicEngine.setVolume(Number(e.target.value))}
                      className="w-24 accent-[#FF6B1A]"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectExternalStream(null);
                      musicEngine.playForModule(activeModule);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-500/40 bg-orange-500/15 px-3 py-1.5 text-xs font-semibold text-orange-200 hover:bg-orange-500/25 whitespace-nowrap"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Nhạc hợp mục này ({MUSIC_GENRE_META[recommendedGenre].badgeLabel})</span>
                  </button>
                </div>
              </div>

              <label className="mt-2.5 flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={musicState.autoSyncModule}
                  onChange={(e) => musicEngine.setAutoSyncModule(e.target.checked)}
                  className="rounded accent-[#FF6B1A]"
                />
                <span>Tự động chuyển thể loại nhạc phù hợp khi bạn đổi phân khu trong NexaLife OS</span>
              </label>
            </div>

            {/* 8-Genre Filter Strip */}
            <div className="border-b border-zinc-800 px-5 py-3">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedGenre('all')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    selectedGenre === 'all'
                      ? 'bg-[#FF6B1A] text-zinc-950'
                      : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  Tất cả ({MUSIC_TRACKS.length})
                </button>
                {MUSIC_GENRE_ORDER.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setSelectedGenre(genre)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      selectedGenre === genre
                        ? 'bg-[#FF6B1A] text-zinc-950'
                        : 'border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    {MUSIC_GENRE_META[genre].labelVi}
                  </button>
                ))}
              </div>
              {selectedGenre !== 'all' && (
                <p className="mt-2 text-xs text-zinc-400">
                  {MUSIC_GENRE_META[selectedGenre].descriptionVi}
                </p>
              )}
            </div>

            {/* Scrollable 26-Track Catalog */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {visibleTracks.map((track) => {
                  const active = track.id === musicState.currentTrack.id && !activeExternalStream;
                  const meta = MUSIC_GENRE_META[track.genre];
                  return (
                    <button
                      key={track.id}
                      type="button"
                      onClick={() => {
                        onSelectExternalStream(null);
                        if (active) {
                          musicEngine.togglePlay();
                        } else {
                          musicEngine.selectTrack(track.id, true);
                        }
                      }}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                        active
                          ? 'border-[#FF6B1A] bg-orange-950/35'
                          : 'border-zinc-800 bg-[#13151C] hover:border-zinc-600'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`font-semibold ${meta.accentClass}`}>{meta.badgeLabel}</span>
                          <span className="text-zinc-600">·</span>
                          <span className="font-mono text-zinc-400 tabular-nums">{track.bpm} BPM</span>
                        </div>
                        <div className="mt-0.5 truncate text-sm font-bold text-white">
                          {track.title}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-400">{track.moodVi}</div>
                      </div>
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                          active && musicState.isPlaying
                            ? 'bg-[#FF6B1A] text-zinc-950'
                            : 'bg-zinc-800 text-zinc-200'
                        }`}
                      >
                        {active && musicState.isPlaying ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4 ml-0.5" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* SOURCE TAB 2 & 3: YOUTUBE & SPOTIFY EMBEDDED STREAMING */}
        {(sourceTab === 'youtube' || sourceTab === 'spotify') && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Custom URL Input */}
            <form onSubmit={handleCustomUrlSubmit} className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                {sourceTab === 'youtube'
                  ? 'Dán link YouTube / YouTube Music / Playlist bất kỳ để phát trực tiếp trong ứng dụng'
                  : 'Dán link Spotify (Track, Playlist, Album, Podcast) hoặc URI spotify:playlist:...'}
              </label>
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-0 flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={customUrlInput}
                    onChange={(e) => setCustomUrlInput(e.target.value)}
                    placeholder={
                      sourceTab === 'youtube'
                        ? 'https://www.youtube.com/watch?v=jfKfPfyJRdk hoặc link playlist...'
                        : 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn'
                    }
                    className="w-full rounded-xl border border-zinc-800 bg-[#08090C] py-2.5 pl-9 pr-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-[#FF6B1A] focus:outline-none"
                  />
                </div>
                <button
                  type="submit"
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold whitespace-nowrap ${
                    sourceTab === 'youtube'
                      ? 'bg-rose-500 text-white hover:bg-rose-400'
                      : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  }`}
                >
                  Phát ngay
                </button>
              </div>
              {urlError && (
                <p className="text-xs text-rose-400">{urlError}</p>
              )}
            </form>

            {/* Active Embedded Player Preview */}
            {activeExternalStream && activeExternalStream.provider === sourceTab && (
              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {activeExternalStream.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      Đang phát nội tuyến · Bạn có thể đóng Studio, trình phát thu gọn sẽ tiếp tục chạy ở góc màn hình
                    </div>
                  </div>
                </div>
                <iframe
                  title={activeExternalStream.title}
                  src={activeExternalStream.embedUrl}
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                  loading="lazy"
                  className={`w-full rounded-lg border border-slate-800 ${
                    sourceTab === 'youtube' ? 'h-56 sm:h-64' : 'h-[352px]'
                  }`}
                />
              </div>
            )}

            {/* Curated Playlists Grid */}
            <div>
              <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {sourceTab === 'youtube'
                  ? 'Kênh YouTube tuyển chọn theo hoạt động'
                  : 'Playlist Spotify tuyển chọn theo tâm trạng & bài tập'}
              </h3>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {(sourceTab === 'youtube' ? CURATED_YOUTUBE_STREAMS : CURATED_SPOTIFY_PLAYLISTS).map(
                  (item) => {
                    const isCurrent = activeExternalStream?.embedUrl === item.embedUrl;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handlePlayCuratedExternal(item)}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                          isCurrent
                            ? sourceTab === 'youtube'
                              ? 'border-rose-400 bg-rose-950/40'
                              : 'border-emerald-400 bg-emerald-950/40'
                            : 'border-slate-800 bg-slate-950/60 hover:border-slate-600'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <span
                            className={`text-[11px] font-semibold ${
                              sourceTab === 'youtube' ? 'text-rose-400' : 'text-emerald-400'
                            }`}
                          >
                            {item.genreLabel}
                          </span>
                          <div className="mt-0.5 truncate text-sm font-bold text-white">
                            {item.title}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-400">
                            {item.subtitle}
                          </div>
                        </div>
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            isCurrent
                              ? sourceTab === 'youtube'
                                ? 'bg-rose-500 text-white'
                                : 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-200'
                          }`}
                        >
                          <Play className="h-4 w-4 ml-0.5" />
                        </div>
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
