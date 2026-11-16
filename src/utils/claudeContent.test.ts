import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_CONTENT_TEMPLATES,
  buildClaudeContentRequestPayload,
  buildYouTubeFallbackLinks,
  extractClaudeResponseText,
} from './claudeContent';

test('buildClaudeContentRequestPayload builds valid prompt and token budget for workout guide with exercise context', () => {
  const built = buildClaudeContentRequestPayload({
    templateId: 'workout_guide',
    topic: 'Biến thể giảm áp lực đầu gối cho người mới',
    tone: 'coach',
    length: 'detailed',
    language: 'vi',
    exerciseContext: {
      name: 'Squat & Sức mạnh Thân dưới',
      equipment: 'Thảm tập',
      repsOrHold: '15 lần × 4 hiệp',
      steps: ['Hạ hông ra sau', 'Giữ gối thẳng hàng mũi chân'],
    },
  });

  assert.equal(built.templateId, 'workout_guide');
  assert.equal(built.maxTokens, 1900);
  assert.ok(built.systemPrompt.includes('tiếng Việt'));
  assert.ok(built.userPrompt.includes('Squat & Sức mạnh Thân dưới'));
  assert.ok(built.userPrompt.includes('Biến thể giảm áp lực đầu gối'));
});

test('buildClaudeContentRequestPayload falls back safely on unknown template, tone, and length', () => {
  const built = buildClaudeContentRequestPayload({
    templateId: 'unknown_xyz',
    tone: 'unknown_tone',
    length: 'unknown_len',
    topic: 'Tạo thực đơn 1800 kcal',
  });

  assert.equal(built.templateId, 'general_content');
  assert.equal(built.tone, 'coach');
  assert.equal(built.length, 'medium');
  assert.equal(built.maxTokens, 1100);
  assert.ok(CLAUDE_CONTENT_TEMPLATES.length >= 5);
});

test('extractClaudeResponseText joins text blocks and skips non-text blocks', () => {
  const text = extractClaudeResponseText([
    { type: 'thinking', text: 'internal' },
    { type: 'text', text: '  Đoạn 1 hướng dẫn.  ' },
    { type: 'text', text: 'Đoạn 2 chi tiết.' },
  ]);
  assert.equal(text, 'Đoạn 1 hướng dẫn.\n\nĐoạn 2 chi tiết.');
  assert.equal(extractClaudeResponseText(null), '');
});

test('buildYouTubeFallbackLinks produces safe embed, direct watch, and search URLs', () => {
  const links = buildYouTubeFallbackLinks('v7AYKMP6rOE', 'Sun Salutation A Yoga tutorial');
  assert.equal(links.embedUrl, 'https://www.youtube.com/embed/v7AYKMP6rOE?rel=0');
  assert.equal(links.watchUrl, 'https://www.youtube.com/watch?v=v7AYKMP6rOE');
  assert.ok(links.searchUrl.includes('https://www.youtube.com/results?search_query='));
  assert.ok(links.searchUrl.includes('Sun%20Salutation%20A'));

  const missingId = buildYouTubeFallbackLinks('', 'Goblet Squat form');
  assert.equal(missingId.embedUrl, '');
  assert.ok(missingId.watchUrl.startsWith('https://www.youtube.com/results?search_query='));
});
