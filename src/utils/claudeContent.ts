export type ClaudeContentTemplateId =
  | 'workout_guide'
  | 'meal_plan'
  | 'language_lesson'
  | 'video_script'
  | 'general_content';

export type ClaudeContentTone = 'coach' | 'friendly' | 'academic' | 'concise';
export type ClaudeContentLength = 'short' | 'medium' | 'detailed';

export interface ClaudeTemplateMeta {
  id: ClaudeContentTemplateId;
  labelVi: string;
  descriptionVi: string;
  placeholderVi: string;
  systemRole: string;
}

export const CLAUDE_CONTENT_TEMPLATES: ClaudeTemplateMeta[] = [
  {
    id: 'workout_guide',
    labelVi: 'Giáo án & Kỹ thuật tập',
    descriptionVi: 'Tạo biến thể độ khó, lộ trình buổi tập, khởi động và lưu ý an toàn khớp.',
    placeholderVi: 'Ví dụ: Lịch tập 3 buổi/tuần kết hợp Squat và kéo xà cho người mới bị đau nhẹ đầu gối...',
    systemRole:
      'Bạn là Huấn luyện viên Thể chất & Giải phẫu Vận động cao cấp. Hãy tạo nội dung tập luyện rõ ràng từng bước, chuẩn đơn vị (phút, giây, lần, hiệp, kg), có khởi động, nhịp thở và cảnh báo an toàn chấn thương.',
  },
  {
    id: 'meal_plan',
    labelVi: 'Thực đơn & Dinh dưỡng',
    descriptionVi: 'Thiết kế thực đơn đủ đạm, công thức nấu nhanh với nguyên liệu Việt Nam.',
    placeholderVi: 'Ví dụ: Thực đơn 1 ngày 1900 kcal giàu đạm, ít dầu mỡ với ức gà, trứng và rau xanh...',
    systemRole:
      'Bạn là Chuyên gia Dinh dưỡng Thực hành. Hãy lập thực đơn cân đối calo và macro (Đạm/Tinh bột/Béo/Xơ), khẩu phần rõ gam/ml, nêu rõ đây là ước tính tham khảo.',
  },
  {
    id: 'language_lesson',
    labelVi: 'Bài học & Hội thoại Ngoại ngữ',
    descriptionVi: 'Soạn đoạn hội thoại song ngữ, bảng từ vựng và bài tập phản xạ theo trình độ.',
    placeholderVi: 'Ví dụ: Hội thoại tiếng Anh trình độ B1 chủ đề đặt lịch tập với HLV và từ vựng liên quan...',
    systemRole:
      'Bạn là Chuyên gia Ngôn ngữ học & Sư phạm Đa ngôn ngữ. Tạo bài học gồm từ vựng cốt lõi (kèm phiên âm), hội thoại tự nhiên song ngữ và 3 câu hỏi luyện tập có đáp án.',
  },
  {
    id: 'video_script',
    labelVi: 'Kịch bản Video & Nội dung Sáng tạo',
    descriptionVi: 'Viết kịch bản video ngắn 30–60 giây, lời bình giọng đọc AI và chú thích rõ ý.',
    placeholderVi: 'Ví dụ: Kịch bản video 45 giây hướng dẫn 3 lỗi sai hay gặp khi tập Plank tại nhà...',
    systemRole:
      'Bạn là Biên kịch Nội dung Sức khỏe & Giáo dục. Hãy viết kịch bản chia theo phân cảnh (Cảnh / Hình ảnh / Lời đọc giọng AI rõ nhịp dấu câu) mạch lạc, súc tích và dễ quay dựng.',
  },
  {
    id: 'general_content',
    labelVi: 'Nội dung Tổng hợp theo Yêu cầu',
    descriptionVi: 'Tóm tắt tài liệu, lập kế hoạch học tập, viết ghi chú hoặc bài chia sẻ.',
    placeholderVi: 'Nhập chủ đề bất kỳ bạn muốn Claude biên soạn nội dung chi tiết...',
    systemRole:
      'Bạn là Trợ lý Biên tập Nội dung Chuyên sâu dùng mô hình Claude. Hãy trình bày cấu trúc rõ ràng với tiêu đề, gạch đầu dòng dễ áp dụng thực tế.',
  },
];

const TONE_INSTRUCTIONS: Record<ClaudeContentTone, string> = {
  coach: 'Giọng điệu huấn luyện viên: dứt khoát, truyền động lực, thực tế.',
  friendly: 'Giọng điệu thân thiện, gần gũi, dễ hiểu cho người mới.',
  academic: 'Giọng điệu phân tích khoa học, chính xác thuật ngữ và giải thích cơ chế.',
  concise: 'Giọng điệu cô đọng tối đa, đi thẳng vào danh sách hành động.',
};

const LENGTH_MAX_TOKENS: Record<ClaudeContentLength, number> = {
  short: 550,
  medium: 1100,
  detailed: 1900,
};

const LENGTH_INSTRUCTIONS: Record<ClaudeContentLength, string> = {
  short: 'Độ dài ngắn gọn (khoảng 150–250 từ), súc tích.',
  medium: 'Độ dài vừa phải (khoảng 350–550 từ), đầy đủ ý chính và ví dụ.',
  detailed: 'Độ dài chuyên sâu (khoảng 700–1000 từ), phân tích kỹ từng bước và lưu ý.',
};

export interface ClaudeBuildInput {
  templateId?: string;
  topic?: string;
  tone?: string;
  length?: string;
  language?: 'vi' | 'en';
  exerciseContext?: {
    name?: string;
    equipment?: string;
    repsOrHold?: string;
    steps?: string[];
  } | null;
}

export interface ClaudeBuiltPrompt {
  templateId: ClaudeContentTemplateId;
  tone: ClaudeContentTone;
  length: ClaudeContentLength;
  maxTokens: number;
  systemPrompt: string;
  userPrompt: string;
}

export function buildClaudeContentRequestPayload(input: ClaudeBuildInput): ClaudeBuiltPrompt {
  const validTemplates = new Set<ClaudeContentTemplateId>(
    CLAUDE_CONTENT_TEMPLATES.map((t) => t.id)
  );
  const templateId: ClaudeContentTemplateId = validTemplates.has(
    input.templateId as ClaudeContentTemplateId
  )
    ? (input.templateId as ClaudeContentTemplateId)
    : 'general_content';

  const tone: ClaudeContentTone =
    input.tone && input.tone in TONE_INSTRUCTIONS
      ? (input.tone as ClaudeContentTone)
      : 'coach';

  const length: ClaudeContentLength =
    input.length && input.length in LENGTH_MAX_TOKENS
      ? (input.length as ClaudeContentLength)
      : 'medium';

  const meta =
    CLAUDE_CONTENT_TEMPLATES.find((t) => t.id === templateId) || CLAUDE_CONTENT_TEMPLATES[4];

  const langDirective =
    input.language === 'en'
      ? 'Write the generated content in natural, clear English.'
      : 'Viết toàn bộ nội dung bằng tiếng Việt chuẩn mực, dễ đọc, có dấu câu tự nhiên để giọng đọc AI phát âm rõ.';

  const systemPrompt = `${meta.systemRole}\n${TONE_INSTRUCTIONS[tone]}\n${LENGTH_INSTRUCTIONS[length]}\n${langDirective}`;

  const cleanTopic = (input.topic || '').trim();
  const ctxLines: string[] = [];
  if (input.exerciseContext?.name) {
    ctxLines.push(`Bài tập đang chọn: ${input.exerciseContext.name}`);
    if (input.exerciseContext.equipment) {
      ctxLines.push(`Dụng cụ: ${input.exerciseContext.equipment}`);
    }
    if (input.exerciseContext.repsOrHold) {
      ctxLines.push(`Khối lượng chuẩn: ${input.exerciseContext.repsOrHold}`);
    }
    if (Array.isArray(input.exerciseContext.steps) && input.exerciseContext.steps.length > 0) {
      ctxLines.push(`Các bước hiện tại:\n- ${input.exerciseContext.steps.slice(0, 6).join('\n- ')}`);
    }
  }

  const userPrompt =
    ctxLines.length > 0
      ? `${ctxLines.join('\n')}\n\nYêu cầu tạo nội dung: ${cleanTopic || 'Tạo biến thể phù hợp người mới, lỗi cần tránh và mẹo hít thở.'}`
      : cleanTopic || meta.placeholderVi;

  return {
    templateId,
    tone,
    length,
    maxTokens: LENGTH_MAX_TOKENS[length],
    systemPrompt,
    userPrompt,
  };
}

export function extractClaudeResponseText(
  blocks: Array<{ type?: string; text?: string }> | null | undefined
): string {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text!.trim())
    .filter(Boolean)
    .join('\n\n');
}

export interface YouTubeExerciseLinks {
  videoId: string;
  embedUrl: string;
  watchUrl: string;
  searchUrl: string;
}

export function buildYouTubeFallbackLinks(
  youtubeVideoId: string,
  youtubeSearchQuery: string
): YouTubeExerciseLinks {
  const safeId = (youtubeVideoId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  const query = (youtubeSearchQuery || 'home workout tutorial').trim();
  return {
    videoId: safeId,
    embedUrl: safeId ? `https://www.youtube.com/embed/${safeId}?rel=0` : '',
    watchUrl: safeId
      ? `https://www.youtube.com/watch?v=${encodeURIComponent(safeId)}`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    searchUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
  };
}
