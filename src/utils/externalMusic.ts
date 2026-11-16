export type ExternalMusicProvider = 'youtube' | 'spotify';

export interface ParsedExternalMusicSource {
  provider: ExternalMusicProvider;
  id: string;
  embedUrl: string;
  canonicalUrl: string;
  resourceType: 'video' | 'playlist' | 'track' | 'album' | 'artist' | 'episode' | 'show';
}

export interface CuratedExternalStream {
  id: string;
  provider: ExternalMusicProvider;
  title: string;
  subtitle: string;
  genreLabel: string;
  sourceUrl: string;
  embedUrl: string;
}

export function parseYouTubeEmbedUrl(input: string): ParsedExternalMusicSource | null {
  const raw = input.trim();
  if (!raw) return null;

  // Allow raw YouTube 11-char video IDs or PL/OL playlist IDs
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) {
    return {
      provider: 'youtube',
      id: raw,
      resourceType: 'video',
      canonicalUrl: `https://www.youtube.com/watch?v=${raw}`,
      embedUrl: `https://www.youtube.com/embed/${raw}?autoplay=1&rel=0`,
    };
  }
  if (/^(PL|OL|UU|LL)[A-Za-z0-9_-]{10,}$/.test(raw)) {
    return {
      provider: 'youtube',
      id: raw,
      resourceType: 'playlist',
      canonicalUrl: `https://www.youtube.com/playlist?list=${raw}`,
      embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(raw)}&autoplay=1&rel=0`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const isYouTube =
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com';
  if (!isYouTube) return null;

  let videoId = '';
  const listId = parsed.searchParams.get('list') || '';

  if (host === 'youtu.be') {
    videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
  } else {
    const vParam = parsed.searchParams.get('v');
    if (vParam) {
      videoId = vParam;
    } else {
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'embed' || parts[0] === 'shorts' || parts[0] === 'live') {
        videoId = parts[1] || '';
      }
    }
  }

  videoId = videoId.replace(/[^A-Za-z0-9_-]/g, '');
  const cleanListId = listId.replace(/[^A-Za-z0-9_-]/g, '');

  if (videoId && cleanListId) {
    return {
      provider: 'youtube',
      id: videoId,
      resourceType: 'video',
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}&list=${cleanListId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?list=${encodeURIComponent(cleanListId)}&autoplay=1&rel=0`,
    };
  }

  if (videoId) {
    return {
      provider: 'youtube',
      id: videoId,
      resourceType: 'video',
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`,
    };
  }

  if (cleanListId) {
    return {
      provider: 'youtube',
      id: cleanListId,
      resourceType: 'playlist',
      canonicalUrl: `https://www.youtube.com/playlist?list=${cleanListId}`,
      embedUrl: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(cleanListId)}&autoplay=1&rel=0`,
    };
  }

  return null;
}

export function parseSpotifyEmbedUrl(input: string): ParsedExternalMusicSource | null {
  const raw = input.trim();
  if (!raw) return null;

  // Handle spotify:playlist:ID or spotify:track:ID URI
  const uriMatch = raw.match(/^spotify:(track|playlist|album|artist|episode|show):([A-Za-z0-9]+)$/i);
  if (uriMatch) {
    const resourceType = uriMatch[1].toLowerCase() as ParsedExternalMusicSource['resourceType'];
    const id = uriMatch[2];
    return {
      provider: 'spotify',
      id,
      resourceType,
      canonicalUrl: `https://open.spotify.com/${resourceType}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${resourceType}/${id}?utm_source=generator&theme=0`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (host !== 'open.spotify.com' && host !== 'play.spotify.com') {
    return null;
  }

  const segments = parsed.pathname.split('/').filter(Boolean);
  // Strip optional locale prefix like intl-vi / intl-en or /embed
  const cleaned = segments.filter((seg) => !/^intl-[a-z]{2}$/i.test(seg) && seg !== 'embed');
  const validTypes = new Set(['track', 'playlist', 'album', 'artist', 'episode', 'show']);
  if (cleaned.length < 2 || !validTypes.has(cleaned[0].toLowerCase())) {
    return null;
  }

  const resourceType = cleaned[0].toLowerCase() as ParsedExternalMusicSource['resourceType'];
  const id = cleaned[1].replace(/[^A-Za-z0-9]/g, '');
  if (!id) return null;

  return {
    provider: 'spotify',
    id,
    resourceType,
    canonicalUrl: `https://open.spotify.com/${resourceType}/${id}`,
    embedUrl: `https://open.spotify.com/embed/${resourceType}/${id}?utm_source=generator&theme=0`,
  };
}

export function parseExternalMusicInput(input: string): ParsedExternalMusicSource | null {
  const lower = input.toLowerCase();
  if (lower.includes('spotify')) {
    return parseSpotifyEmbedUrl(input);
  }
  if (lower.includes('youtu')) {
    return parseYouTubeEmbedUrl(input);
  }
  return parseSpotifyEmbedUrl(input) || parseYouTubeEmbedUrl(input);
}

export const CURATED_YOUTUBE_STREAMS: CuratedExternalStream[] = [
  {
    id: 'yt-lofi-girl',
    provider: 'youtube',
    title: 'Lofi Hip Hop Radio · Beats to Relax / Study',
    subtitle: 'Kênh Lo-Fi kinh điển cho học ngoại ngữ & Pomodoro',
    genreLabel: 'Lo-Fi Study',
    sourceUrl: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
    embedUrl: 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&rel=0',
  },
  {
    id: 'yt-synthwave-focus',
    provider: 'youtube',
    title: 'Synthwave Radio · Chill Synth / Retro Beats',
    subtitle: 'Nhịp điện tử tập trung & thế giới Game AI',
    genreLabel: 'Arcade / Focus',
    sourceUrl: 'https://www.youtube.com/watch?v=4xDzrJKXOOY',
    embedUrl: 'https://www.youtube.com/embed/4xDzrJKXOOY?autoplay=1&rel=0',
  },
  {
    id: 'yt-piano-relax',
    provider: 'youtube',
    title: 'Peaceful Piano & Rain · Deep Focus Reading',
    subtitle: 'Dương cầm dịu êm kết hợp tiếng mưa thư giãn',
    genreLabel: 'Piano Focus',
    sourceUrl: 'https://www.youtube.com/watch?v=lTRiuFIWV54',
    embedUrl: 'https://www.youtube.com/embed/lTRiuFIWV54?autoplay=1&rel=0',
  },
  {
    id: 'yt-gym-phonk',
    provider: 'youtube',
    title: 'Aggressive Phonk Workout Mix · Gym & Cardio',
    subtitle: 'Bass mạnh bùng nổ năng lượng cho HIIT, Squat & Push-up',
    genreLabel: 'Phonk Gym',
    sourceUrl: 'https://www.youtube.com/watch?v=5qap5aO4i9A',
    embedUrl: 'https://www.youtube.com/embed/5qap5aO4i9A?autoplay=1&rel=0',
  },
  {
    id: 'yt-zen-432hz',
    provider: 'youtube',
    title: '432Hz Healing Meditation & Yoga Flow',
    subtitle: 'Tần số tĩnh tâm sâu cho Yoga sáng và thiền trước khi ngủ',
    genreLabel: 'Thiền 432Hz',
    sourceUrl: 'https://www.youtube.com/watch?v=eKFTSSKCzWA',
    embedUrl: 'https://www.youtube.com/embed/eKFTSSKCzWA?autoplay=1&rel=0',
  },
  {
    id: 'yt-kids-happy',
    provider: 'youtube',
    title: 'Upbeat Happy Instrumental · Game Kid & Sáng tạo',
    subtitle: 'Âm nhạc vui tươi truyền cảm hứng cho bé và gia đình',
    genreLabel: 'Kid & Family',
    sourceUrl: 'https://www.youtube.com/watch?v=7NOSDKb0HlU',
    embedUrl: 'https://www.youtube.com/embed/7NOSDKb0HlU?autoplay=1&rel=0',
  },
];

export const CURATED_SPOTIFY_PLAYLISTS: CuratedExternalStream[] = [
  {
    id: 'sp-lofi-beats',
    provider: 'spotify',
    title: 'Lofi Beats (Spotify Official)',
    subtitle: 'Chill beats, lofi vibes, new tracks every week for deep focus',
    genreLabel: 'Lo-Fi Study',
    sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0',
  },
  {
    id: 'sp-phonk-gym',
    provider: 'spotify',
    title: 'PHONK · Workout Beast Mode',
    subtitle: 'Drift Phonk & heavy 808 bass cho phòng tập tại nhà',
    genreLabel: 'Phonk Gym',
    sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DWWY64wDtewQt',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWWY64wDtewQt?utm_source=generator&theme=0',
  },
  {
    id: 'sp-vpop-rising',
    provider: 'spotify',
    title: 'V-Pop Không Thể Thiếu',
    subtitle: 'Tuyển tập Nhạc Việt V-Pop Chill, Ballad & Hit thịnh hành',
    genreLabel: 'Nhạc Việt V-Pop',
    sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX0F4i7Q9pshJ',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX0F4i7Q9pshJ?utm_source=generator&theme=0',
  },
  {
    id: 'sp-usuk-hits',
    provider: 'spotify',
    title: "Today's Top Hits (US-UK)",
    subtitle: 'Bảng xếp hạng Pop & Dance Âu Mỹ thịnh hành toàn cầu',
    genreLabel: 'US-UK Hits',
    sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M?utm_source=generator&theme=0',
  },
  {
    id: 'sp-peaceful-piano',
    provider: 'spotify',
    title: 'Peaceful Piano',
    subtitle: 'Dương cầm thư giãn cho học tập, đọc sách và nghỉ ngơi',
    genreLabel: 'Piano Focus',
    sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DX4sWSpwq3LiO?utm_source=generator&theme=0',
  },
  {
    id: 'sp-meditation',
    provider: 'spotify',
    title: 'Deep Sleep & Meditation',
    subtitle: 'Âm thanh tĩnh tâm cho Yoga, hít thở và giấc ngủ ngon',
    genreLabel: 'Thiền & Ngủ',
    sourceUrl: 'https://open.spotify.com/playlist/37i9dQZF1DWZd79rJ6a7lp',
    embedUrl: 'https://open.spotify.com/embed/playlist/37i9dQZF1DWZd79rJ6a7lp?utm_source=generator&theme=0',
  },
];
