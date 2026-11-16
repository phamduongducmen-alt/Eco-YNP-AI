import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURATED_SPOTIFY_PLAYLISTS,
  CURATED_YOUTUBE_STREAMS,
  parseExternalMusicInput,
  parseSpotifyEmbedUrl,
  parseYouTubeEmbedUrl,
} from './externalMusic';
import { normalizeVietnameseForSpeech, pickBestBrowserVoice } from './voiceEngine';

test('parseYouTubeEmbedUrl parses watch, short, playlist, music.youtube, and raw IDs cleanly', () => {
  const watch = parseYouTubeEmbedUrl('https://www.youtube.com/watch?v=jfKfPfyJRdk');
  assert.equal(watch?.provider, 'youtube');
  assert.equal(watch?.id, 'jfKfPfyJRdk');
  assert.equal(watch?.embedUrl, 'https://www.youtube.com/embed/jfKfPfyJRdk?autoplay=1&rel=0');

  const shortUrl = parseYouTubeEmbedUrl('https://youtu.be/4xDzrJKXOOY?t=30');
  assert.equal(shortUrl?.id, '4xDzrJKXOOY');

  const ytMusic = parseYouTubeEmbedUrl('https://music.youtube.com/watch?v=lTRiuFIWV54&list=RDCLAK5uy');
  assert.equal(ytMusic?.id, 'lTRiuFIWV54');
  assert.ok(ytMusic?.embedUrl.includes('list=RDCLAK5uy'));

  const playlist = parseYouTubeEmbedUrl('https://www.youtube.com/playlist?list=PL6NdkXsPL07KN01gH2vucrHCEyyNmVEx4');
  assert.equal(playlist?.resourceType, 'playlist');
  assert.ok(playlist?.embedUrl.includes('videoseries?list=PL6NdkXsPL07KN01gH2vucrHCEyyNmVEx4'));

  assert.equal(parseYouTubeEmbedUrl('https://example.com/not-youtube'), null);
});

test('parseSpotifyEmbedUrl parses track, playlist, album, intl URLs, and spotify URIs', () => {
  const pl = parseSpotifyEmbedUrl('https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn?si=abc123');
  assert.equal(pl?.provider, 'spotify');
  assert.equal(pl?.resourceType, 'playlist');
  assert.equal(
    pl?.embedUrl,
    'https://open.spotify.com/embed/playlist/37i9dQZF1DWWQRwui0ExPn?utm_source=generator&theme=0'
  );

  const intlTrack = parseSpotifyEmbedUrl('https://open.spotify.com/intl-vi/track/4cOdK2wGLETKBW3PvgPWqT');
  assert.equal(intlTrack?.resourceType, 'track');
  assert.equal(intlTrack?.id, '4cOdK2wGLETKBW3PvgPWqT');

  const uri = parseSpotifyEmbedUrl('spotify:album:1ATL5GLyefJaxhQzSPVrLX');
  assert.equal(uri?.resourceType, 'album');
  assert.equal(uri?.id, '1ATL5GLyefJaxhQzSPVrLX');

  assert.equal(parseSpotifyEmbedUrl('https://youtube.com/watch?v=12345678901'), null);
});

test('parseExternalMusicInput auto-detects YouTube vs Spotify URLs and curated catalogs are valid', () => {
  assert.equal(
    parseExternalMusicInput('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT')?.provider,
    'spotify'
  );
  assert.equal(parseExternalMusicInput('https://youtu.be/jfKfPfyJRdk')?.provider, 'youtube');
  assert.ok(CURATED_YOUTUBE_STREAMS.length >= 6);
  assert.ok(CURATED_SPOTIFY_PLAYLISTS.length >= 6);
  for (const item of CURATED_YOUTUBE_STREAMS) {
    assert.ok(item.embedUrl.startsWith('https://www.youtube.com/embed/'));
  }
  for (const item of CURATED_SPOTIFY_PLAYLISTS) {
    assert.ok(item.embedUrl.startsWith('https://open.spotify.com/embed/'));
  }
});

test('normalizeVietnameseForSpeech expands units, ranges, and symbols for crystal-clear Vietnamese TTS', () => {
  const sample = 'Bước 01: Squat · 10–14 lần · 320 kcal / 15p (250ml)';
  const normalized = normalizeVietnameseForSpeech(sample);
  assert.ok(normalized.includes('Bước 1,'));
  assert.ok(normalized.includes('10 đến 14'));
  assert.ok(normalized.includes('320 ki-lô ca-lo'));
  assert.ok(normalized.includes('15 phút'));
  assert.ok(normalized.includes('250 mi-li-lít'));
  assert.ok(!normalized.includes('·'));
});

test('pickBestBrowserVoice ranks Natural and Online Vietnamese voices ahead of basic voices', () => {
  const voices = [
    { name: 'Basic Vietnamese Female', lang: 'vi-VN' },
    { name: 'Microsoft HoaiMy Online (Natural) - Vietnamese (Vietnam)', lang: 'vi-VN' },
  ];
  const picked = pickBestBrowserVoice(voices, 'vi-VN', 'female', 'vi');
  assert.equal(picked.matchedGenderExplicitly, true);
  assert.ok(picked.voice?.name.includes('Natural'));
});
