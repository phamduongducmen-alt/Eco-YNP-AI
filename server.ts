import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildClaudeContentRequestPayload,
  extractClaudeResponseText,
} from './src/utils/claudeContent';
import {
  buildCombinedVerdict,
  buildLocalCognitiveAnalysis,
  buildSpeechCoachFocus,
  type ClaudeLinguistAnalysis,
  type EnglishGameMode,
  type EnglishRoundAnswerRecord,
  type EnglishTopicFilter,
  type GeminiCoachAnalysis,
} from './src/utils/englishGameEngine';
import type { CefrLevel } from './src/types/lifeworld';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getClaudeModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || 'claude-sonnet-4-5';
}

function createClaudeClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_ANTHROPIC_API_KEY') {
    return null;
  }
  return new Anthropic({ apiKey });
}

interface LeaderboardEntry {
  id: string;
  name: string;
  xp: number;
  level: number;
  streakDays: number;
  updatedAt: string;
}

const DATA_DIR = path.resolve(__dirname, '.lifeworld-data');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

const SEED_LEADERBOARD: LeaderboardEntry[] = [
  { id: 'lb-1', name: 'Phạm Dương Đức', xp: 1420, level: 6, streakDays: 14, updatedAt: '2026-11-14T08:00:00Z' },
  { id: 'lb-2', name: 'Quốc Bảo', xp: 1180, level: 5, streakDays: 11, updatedAt: '2026-11-14T09:15:00Z' },
  { id: 'lb-3', name: 'Lan Chi', xp: 890, level: 4, streakDays: 9, updatedAt: '2026-11-14T10:30:00Z' },
  { id: 'lb-4', name: 'Hoàng Nam', xp: 640, level: 3, streakDays: 6, updatedAt: '2026-11-14T11:00:00Z' },
];

function loadLeaderboard(): LeaderboardEntry[] {
  try {
    if (fs.existsSync(LEADERBOARD_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as LeaderboardEntry[];
      }
    }
  } catch {
    // fallback
  }
  return [...SEED_LEADERBOARD];
}

function saveLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(entries, null, 2), 'utf8');
  } catch {
    // ignore
  }
}

let leaderboardEntries = loadLeaderboard();

const PERSONA_SYSTEM_PROMPTS: Record<string, string> = {
  general:
    'Bạn là Trợ lý AI Tổng hợp của AI Life World. Hãy trả lời chính xác, thực tế, cấu trúc rõ ràng và ưu tiên an toàn sức khỏe.',
  fitness:
    'Bạn là AI Fitness Coach. Thiết kế bài tập tại nhà khoa học, nhấn mạnh kỹ thuật an toàn, khởi động, nhịp thở và cảnh báo chấn thương.',
  yoga:
    'Bạn là AI Yoga Coach. Hướng dẫn tư thế Yoga theo nhịp thở, khả năng linh hoạt từng người và các lưu ý bảo vệ cột sống, khớp gối.',
  nutrition:
    'Bạn là AI Nutritionist. Phân tích dinh dưỡng dựa trên dữ liệu thực phẩm tin cậy (USDA/Viện Dinh dưỡng), luôn nêu rõ mức độ ước tính và không bịa đặt số liệu y khoa.',
  language:
    'Bạn là AI Language Tutor đa ngôn ngữ. Sửa lỗi ngữ pháp, giải thích cách dùng tự nhiên, phiên âm và đặt câu hỏi luyện phản xạ giao tiếp.',
  study:
    'Bạn là AI Study Assistant. Hướng dẫn giải bài tập theo từng bước tư duy, giúp người học tự hiểu bản chất thay vì chỉ đưa đáp án.',
  wellness:
    'Bạn là AI Mental Wellness Companion. Lắng nghe đồng cảm, gợi ý bài tập thở, viết nhật ký tích cực và không thay thế bác sĩ tâm lý lâm sàng.',
  planner:
    'Bạn là AI Daily Planner. Sắp xếp thời gian biểu học tập, vận động, uống nước, nghỉ ngơi và giấc ngủ khoa học theo nhịp sinh học.',
};

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'AI Life World API',
      aiConfigured: Boolean(createGeminiClient()),
      claudeConfigured: Boolean(createClaudeClient()),
      models: {
        textVision: 'gemini-4-hydrogen',
        tts: 'gemini-3.8-flash-lite-tts',
        transcribe: 'gemini-3.5-transcribe',
        claude: getClaudeModel(),
      },
      timestamp: new Date().toISOString(),
    });
  });

  // Dedicated Claude Content Generation Endpoint (Anthropic Messages API)
  app.post('/api/claude/generate', async (req, res) => {
    try {
      const {
        templateId = 'general_content',
        topic = '',
        tone = 'coach',
        length = 'medium',
        language = 'vi',
        exerciseContext = null,
      } = req.body as {
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
      };

      const cleanTopic = typeof topic === 'string' ? topic.trim() : '';
      if (!cleanTopic && !exerciseContext?.name) {
        return res.status(400).json({ error: 'Vui lòng nhập chủ đề hoặc chọn bài tập để Claude tạo nội dung.' });
      }

      const claude = createClaudeClient();
      if (!claude) {
        return res.status(503).json({
          code: 'MISSING_ANTHROPIC_KEY',
          error:
            'Tính năng tạo nội dung bằng Claude cần ANTHROPIC_API_KEY trên máy chủ. Hãy cấu hình khóa API trong Settings > Secrets để sử dụng trực tiếp.',
        });
      }

      const built = buildClaudeContentRequestPayload({
        templateId,
        topic: cleanTopic,
        tone,
        length,
        language,
        exerciseContext,
      });

      const model = getClaudeModel();
      const message = await claude.messages.create({
        model,
        max_tokens: built.maxTokens,
        system: built.systemPrompt,
        messages: [{ role: 'user', content: built.userPrompt }],
      });

      const content = extractClaudeResponseText(
        message.content as Array<{ type?: string; text?: string }>
      );

      return res.json({
        content: content || 'Claude chưa trả về nội dung phù hợp.',
        model: message.model || model,
        provider: 'claude',
        templateId: built.templateId,
        usage: message.usage || null,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi kết nối Anthropic Claude API';
      return res.status(502).json({ error: `Không thể tạo nội dung với Claude: ${msg}` });
    }
  });

  // Multi-expert AI Personal Assistant (supports Gemini & Claude)
  app.post('/api/assistant/chat', async (req, res) => {
    try {
      const {
        persona = 'general',
        provider = 'gemini',
        message = '',
        history = [],
        uiLanguage = 'vi',
        personalContext = null,
      } = req.body as {
        persona?: string;
        provider?: 'gemini' | 'claude';
        message?: string;
        history?: Array<{ role: 'user' | 'assistant'; text: string }>;
        uiLanguage?: 'vi' | 'en';
        personalContext?: Record<string, unknown> | null;
      };

      const cleanMessage = typeof message === 'string' ? message.trim() : '';
      if (!cleanMessage) {
        return res.status(400).json({ error: 'Vui lòng nhập nội dung câu hỏi cho trợ lý AI.' });
      }

      const basePrompt = PERSONA_SYSTEM_PROMPTS[persona] || PERSONA_SYSTEM_PROMPTS.general;
      const langInstruction =
        uiLanguage === 'en'
          ? 'Respond primarily in natural English unless the user asks in another language.'
          : 'Trả lời bằng tiếng Việt tự nhiên, rõ ràng, trừ khi người dùng yêu cầu ngoại ngữ khác.';

      const contextSection = personalContext
        ? `\nDữ liệu cá nhân người dùng đã CẤP QUYỀN chia sẻ: ${JSON.stringify(personalContext)}`
        : '\nNgười dùng chưa bật quyền chia sẻ dữ liệu sức khỏe cá nhân; hãy tư vấn theo nguyên tắc chung an toàn.';

      const systemPrompt = `${basePrompt}\n${langInstruction}${contextSection}`;

      if (provider === 'claude') {
        const claude = createClaudeClient();
        if (!claude) {
          return res.status(503).json({
            code: 'MISSING_ANTHROPIC_KEY',
            error:
              'Chế độ Trợ lý Claude chưa được kết nối vì thiếu ANTHROPIC_API_KEY trên máy chủ. Hãy cấu hình khóa API trong Settings > Secrets.',
          });
        }

        const claudeMessages: Array<{ role: 'user' | 'assistant'; content: string }> = Array.isArray(history)
          ? history
              .slice(-6)
              .filter((h) => h && typeof h.text === 'string' && h.text.trim().length > 0)
              .map((h) => ({
                role: h.role === 'assistant' ? 'assistant' : 'user',
                content: h.text.trim(),
              }))
          : [];
        claudeMessages.push({ role: 'user', content: cleanMessage });

        const model = getClaudeModel();
        const claudeReply = await claude.messages.create({
          model,
          max_tokens: 1100,
          system: systemPrompt,
          messages: claudeMessages,
        });

        const text = extractClaudeResponseText(
          claudeReply.content as Array<{ type?: string; text?: string }>
        );

        return res.json({
          reply: text || 'Xin lỗi, Claude chưa tạo được phản hồi phù hợp.',
          model: claudeReply.model || model,
          provider: 'claude',
          persona,
          usedPersonalContext: Boolean(personalContext),
        });
      }

      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          code: 'MISSING_GEMINI_KEY',
          error:
            'Trợ lý AI thật chưa được kết nối vì thiếu GEMINI_API_KEY trên máy chủ. Hãy cấu hình khóa API trong Settings > Secrets để kích hoạt AI.',
        });
      }

      const historyText = Array.isArray(history)
        ? history
            .slice(-6)
            .map((h) => `${h.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${h.text}`)
            .join('\n')
        : '';

      const fullPrompt = historyText
        ? `Lịch sử trò chuyện gần đây:\n${historyText}\n\nCâu hỏi mới: ${cleanMessage}`
        : cleanMessage;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: fullPrompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: systemPrompt,
        },
      });

      return res.json({
        reply: response.text || 'Xin lỗi, AI chưa tạo được phản hồi phù hợp.',
        model: 'gemini-4-hydrogen',
        provider: 'gemini',
        persona,
        usedPersonalContext: Boolean(personalContext),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi kết nối AI API';
      return res.status(502).json({ error: `Không thể gọi trợ lý AI: ${msg}` });
    }
  });

  // Real Nutrition & Food Image/Text Analyzer
  app.post('/api/nutrition/analyze', async (req, res) => {
    try {
      const {
        foodQuery = '',
        grams = 200,
        imageBase64,
        imageMimeType,
      } = req.body as {
        foodQuery?: string;
        grams?: number;
        imageBase64?: string;
        imageMimeType?: string;
      };

      const cleanQuery = typeof foodQuery === 'string' ? foodQuery.trim() : '';
      const hasImage = Boolean(imageBase64 && imageMimeType);

      if (!cleanQuery && !hasImage) {
        return res.status(400).json({
          error: 'Vui lòng nhập tên món ăn/thành phần hoặc tải ảnh món ăn lên để AI phân tích.',
        });
      }

      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          code: 'MISSING_GEMINI_KEY',
          error:
            'Tính năng nhận diện món ăn & ước tính dinh dưỡng AI cần GEMINI_API_KEY trên backend. Bạn vẫn có thể chọn món từ Thư viện Thực phẩm chuẩn hoặc tra cứu mã vạch.',
        });
      }

      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (hasImage && imageBase64 && imageMimeType) {
        parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
      }
      parts.push({
        text: cleanQuery
          ? `Phân tích món ăn/thành phần sau (khối lượng ước tính ${grams}g): ${cleanQuery}`
          : `Nhận diện món ăn trong ảnh và ước tính giá trị dinh dưỡng cho khẩu phần khoảng ${grams}g.`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: { parts },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: `Bạn là chuyên gia dinh dưỡng của AI Life World.
Hãy nhận diện món ăn hoặc thành phần và ước tính dinh dưỡng dựa trên cơ sở dữ liệu USDA / Bảng thành phần thực phẩm Việt Nam.
QUAN TRỌNG: Nêu rõ mức độ ước tính ("Cao", "Trung bình", hoặc "Ước tính thị giác") và cơ sở dữ liệu tham chiếu; tuyệt đối không khẳng định chính xác tuyệt đối như xét nghiệm phòng lab nếu chỉ nhìn ảnh hoặc tên món chung chung.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              dishName: { type: Type.STRING },
              category: { type: Type.STRING },
              estimatedGrams: { type: Type.INTEGER },
              calories: { type: Type.INTEGER },
              proteinG: { type: Type.NUMBER },
              carbsG: { type: Type.NUMBER },
              fatG: { type: Type.NUMBER },
              fiberG: { type: Type.NUMBER },
              sugarG: { type: Type.NUMBER },
              sodiumMg: { type: Type.INTEGER },
              confidenceLevel: { type: Type.STRING, enum: ['Cao', 'Trung bình', 'Ước tính thị giác'] },
              confidenceExplanation: { type: Type.STRING },
              allergens: { type: Type.ARRAY, items: { type: Type.STRING } },
              healthyPairingSuggestion: { type: Type.STRING },
            },
            required: [
              'dishName',
              'category',
              'estimatedGrams',
              'calories',
              'proteinG',
              'carbsG',
              'fatG',
              'fiberG',
              'sugarG',
              'sodiumMg',
              'confidenceLevel',
              'confidenceExplanation',
              'allergens',
              'healthyPairingSuggestion',
            ],
          },
        },
      });

      const data = JSON.parse((response.text ?? '{}').trim());
      return res.json({ ...data, model: 'gemini-4-hydrogen' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi phân tích dinh dưỡng';
      return res.status(502).json({ error: `Không thể phân tích món ăn: ${msg}` });
    }
  });

  // Real OpenFoodFacts Barcode Lookup
  app.get('/api/nutrition/barcode/:code', async (req, res) => {
    const code = String(req.params.code || '').replace(/[^0-9A-Za-z]/g, '');
    if (!code || code.length < 6) {
      return res.status(400).json({ error: 'Mã vạch không hợp lệ (cần ít nhất 6 ký tự số).' });
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'AILifeWorld/1.0' },
      });
      clearTimeout(timeout);
      if (!resp.ok) {
        return res.status(404).json({ error: `Không tìm thấy sản phẩm với mã vạch ${code}.` });
      }
      const json = (await resp.json()) as {
        status?: number;
        product?: {
          product_name?: string;
          brands?: string;
          nutriments?: Record<string, number>;
          allergens_tags?: string[];
          nova_group?: number;
        };
      };
      if (json.status !== 1 || !json.product) {
        return res.status(404).json({ error: `OpenFoodFacts chưa có dữ liệu cho mã vạch ${code}.` });
      }
      const p = json.product;
      const n = p.nutriments || {};
      return res.json({
        barcode: code,
        name: p.product_name || `Sản phẩm ${code}`,
        brand: p.brands || 'Không rõ thương hiệu',
        caloriesPer100g: Math.round(Number(n['energy-kcal_100g'] || 0)),
        proteinPer100g: Number((n['proteins_100g'] || 0).toFixed(1)),
        carbsPer100g: Number((n['carbohydrates_100g'] || 0).toFixed(1)),
        fatPer100g: Number((n['fat_100g'] || 0).toFixed(1)),
        fiberPer100g: Number((n['fiber_100g'] || 0).toFixed(1)),
        sugarPer100g: Number((n['sugars_100g'] || 0).toFixed(1)),
        sodiumMgPer100g: Math.round(Number(n['sodium_100g'] || 0) * 1000),
        novaGroup: p.nova_group || null,
        allergens: p.allergens_tags || [],
        source: 'OpenFoodFacts API (Real Database)',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi kết nối OpenFoodFacts';
      return res.status(502).json({ error: msg });
    }
  });

  // Real Camera Posture Analyzer for Home Fitness
  app.post('/api/fitness/posture', async (req, res) => {
    try {
      const { exerciseName = 'Plank', imageBase64, imageMimeType = 'image/jpeg' } = req.body as {
        exerciseName?: string;
        imageBase64?: string;
        imageMimeType?: string;
      };

      if (!imageBase64) {
        return res.status(400).json({ error: 'Thiếu ảnh khung hình từ camera để phân tích tư thế.' });
      }

      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          code: 'MISSING_GEMINI_KEY',
          error: 'Phân tích tư thế qua camera cần GEMINI_API_KEY trên máy chủ.',
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
            {
              text: `Hãy quan sát khung hình người tập bài "${exerciseName}" này. Đánh giá thẳng hàng cột sống, vai, hông, đầu gối (nếu nhìn thấy rõ trong khung hình). Nếu ảnh mờ hoặc không thấy rõ tư thế, hãy nói rõ hạn chế chứ không đoán bừa.`,
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              visibilityOk: { type: Type.BOOLEAN },
              formSummary: { type: Type.STRING },
              detectedErrors: { type: Type.ARRAY, items: { type: Type.STRING } },
              correctionCues: { type: Type.ARRAY, items: { type: Type.STRING } },
              safetyTip: { type: Type.STRING },
            },
            required: ['visibilityOk', 'formSummary', 'detectedErrors', 'correctionCues', 'safetyTip'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      return res.json({ ...parsed, model: 'gemini-4-hydrogen' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi phân tích tư thế';
      return res.status(502).json({ error: msg });
    }
  });

  // AI Language Tutor, Grammar Check, Translation & Roleplay
  app.post('/api/language/tutor', async (req, res) => {
    try {
      const {
        mode = 'chat',
        targetLanguage = 'Tiếng Anh',
        userLevel = 'B1',
        input = '',
        translateTo = 'Tiếng Việt',
      } = req.body as {
        mode?: 'chat' | 'grammar' | 'translate' | 'dictionary';
        targetLanguage?: string;
        userLevel?: string;
        input?: string;
        translateTo?: string;
      };

      const cleanInput = typeof input === 'string' ? input.trim() : '';
      if (!cleanInput) {
        return res.status(400).json({ error: 'Vui lòng nhập câu hoặc từ vựng.' });
      }

      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          code: 'MISSING_GEMINI_KEY',
          error: 'Gia sư AI Ngoại ngữ cần GEMINI_API_KEY trên máy chủ để hoạt động trực tiếp.',
        });
      }

      let instruction = '';
      if (mode === 'grammar') {
        instruction = `Bạn là giáo viên ngôn ngữ ${targetLanguage} (trình độ học viên ${userLevel}). Hãy sửa lỗi ngữ pháp, đánh giá độ tự nhiên của câu học viên nhập, đưa ra phiên bản chuẩn hơn kèm giải thích ngắn gọn bằng tiếng Việt.`;
      } else if (mode === 'translate') {
        instruction = `Dịch chính xác đoạn văn sau sang ${translateTo}, kèm phiên âm (nếu không phải chữ Latin) và 2 ghi chú sắc thái từ vựng hữu ích bằng tiếng Việt.`;
      } else if (mode === 'dictionary') {
        instruction = `Đóng vai Từ điển thông minh cho từ/cụm từ thuộc ngôn ngữ ${targetLanguage}. Cung cấp phiên âm IPA/Romanization, loại từ, nghĩa tiếng Việt, 2 ví dụ thực tế kèm dịch nghĩa và từ đồng nghĩa.`;
      } else {
        instruction = `Bạn là nhân vật AI bản ngữ đang trò chuyện trực tiếp bằng ${targetLanguage} ở trình độ ${userLevel}. Trả lời ngắn gọn tự nhiên bằng ${targetLanguage}, sau đó đặt 1 câu hỏi tiếp nối và kèm bản dịch/gợi ý nhỏ bằng tiếng Việt trong ngoặc.`;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: cleanInput,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction: instruction,
        },
      });

      return res.json({
        result: response.text || '',
        mode,
        model: 'gemini-4-hydrogen',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi AI Language Tutor';
      return res.status(502).json({ error: msg });
    }
  });

  // Combined Multi-AI Analysis Engine for English Topic Games (Gemini + Claude + Cognitive + Speech Coach)
  app.post('/api/games/english-analysis', async (req, res) => {
    try {
      const {
        records = [],
        selectedTopic = 'all',
        selectedMode = 'vocab_speed',
        userProfile = null,
      } = req.body as {
        records?: EnglishRoundAnswerRecord[];
        selectedTopic?: EnglishTopicFilter;
        selectedMode?: EnglishGameMode;
        userProfile?: {
          displayName?: string;
          languageLevel?: CefrLevel;
          goal?: string;
          workoutsCount?: number;
        } | null;
      };

      const safeRecords = Array.isArray(records) ? records.slice(0, 30) : [];
      const cognitiveMetrics = buildLocalCognitiveAnalysis({
        records: safeRecords,
        selectedTopic,
        selectedMode,
        userLevel: userProfile?.languageLevel || 'B1',
        workoutsCount: userProfile?.workoutsCount ?? 0,
      });
      const speechCoach = buildSpeechCoachFocus(safeRecords, selectedTopic);

      const mistakesSummary = safeRecords
        .filter((r) => !r.isCorrect)
        .slice(0, 6)
        .map((r) => ({
          word: r.word,
          topic: r.topic,
          level: r.level,
          userAnswer: r.userAnswer,
          correctAnswer: r.correctAnswer,
        }));

      const practicedWords = safeRecords.slice(0, 8).map((r) => `${r.word} (${r.topic}, ${r.level})`);
      const ai = createGeminiClient();
      const claude = createClaudeClient();
      const claudeModel = getClaudeModel();

      const geminiTask = async (): Promise<{
        status: 'ok' | 'unconfigured' | 'error';
        model: string;
        data: GeminiCoachAnalysis | null;
        message?: string;
      }> => {
        if (!ai) {
          return {
            status: 'unconfigured',
            model: 'gemini-4-hydrogen',
            data: null,
            message: 'Thiếu GEMINI_API_KEY trên máy chủ.',
          };
        }
        try {
          const prompt = `Phân tích phiên chơi game Tiếng Anh của người học "${userProfile?.displayName || 'Học viên'}" (mục tiêu CEFR hiện tại: ${userProfile?.languageLevel || 'B1'}, mục tiêu sống khỏe: ${userProfile?.goal || 'maintain'}).
Chủ đề: ${selectedTopic}, Chế độ: ${selectedMode}.
Kết quả nhận thức: ${cognitiveMetrics.correctCount}/${cognitiveMetrics.totalQuestions} (${cognitiveMetrics.accuracyPct}%), Tốc độ TB: ${cognitiveMetrics.avgResponseMs}ms (${cognitiveMetrics.speedProfile}), Ước tính CEFR vòng này: ${cognitiveMetrics.estimatedCefr}.
Từ đã luyện: ${JSON.stringify(practicedWords)}
Các lỗi sai (nếu có): ${JSON.stringify(mistakesSummary)}
Hãy đưa ra phân tích sư phạm súc tích bằng tiếng Việt (giữ nguyên các từ/cụm tiếng Anh minh họa).`;

          const response = await ai.models.generateContent({
            model: 'gemini-4-hydrogen',
            contents: prompt,
            config: {
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              systemInstruction:
                'Bạn là Gemini Pedagogical Coach của NexaLife OS. Phân tích lỗi ngữ pháp, collocation và đưa ra lộ trình ôn tập ngắt quãng khoa học.',
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  coachSummary: { type: Type.STRING },
                  grammarAndUsageFixes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        word: { type: Type.STRING },
                        issueVi: { type: Type.STRING },
                        fixTipVi: { type: Type.STRING },
                      },
                      required: ['word', 'issueVi', 'fixTipVi'],
                    },
                  },
                  spacedRepetitionPlan: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  nextTopicRecommendation: { type: Type.STRING },
                  wellnessSynergyTip: { type: Type.STRING },
                },
                required: [
                  'coachSummary',
                  'grammarAndUsageFixes',
                  'spacedRepetitionPlan',
                  'nextTopicRecommendation',
                  'wellnessSynergyTip',
                ],
              },
            },
          });

          const parsed = JSON.parse((response.text ?? '{}').trim()) as GeminiCoachAnalysis;
          return {
            status: 'ok',
            model: 'gemini-4-hydrogen',
            data: parsed,
          };
        } catch (err: unknown) {
          return {
            status: 'error',
            model: 'gemini-4-hydrogen',
            data: null,
            message: err instanceof Error ? err.message : 'Lỗi kết nối Gemini Coach',
          };
        }
      };

      const claudeTask = async (): Promise<{
        status: 'ok' | 'unconfigured' | 'error';
        model: string;
        data: ClaudeLinguistAnalysis | null;
        message?: string;
      }> => {
        if (!claude) {
          return {
            status: 'unconfigured',
            model: claudeModel,
            data: null,
            message:
              'Claude chưa kích hoạt vì thiếu ANTHROPIC_API_KEY trong Settings > Secrets.',
          };
        }
        try {
          const targetVocabulary =
            mistakesSummary.length > 0
              ? mistakesSummary.map((m) => m.word)
              : safeRecords.slice(0, 4).map((r) => r.word);

          const claudeReply = await claude.messages.create({
            model: claudeModel,
            max_tokens: 950,
            system:
              'You are Claude Linguistic Strategist inside NexaLife OS. Always reply ONLY with valid raw JSON matching the exact keys requested, with no markdown fences.',
            messages: [
              {
                role: 'user',
                content: `Create a contextual mini-story/dialogue and nuance analysis for an English learner (level ${cognitiveMetrics.estimatedCefr}) practicing topic "${selectedTopic}".
Focus words: ${JSON.stringify(targetVocabulary)}.
Return strictly valid JSON with keys:
{
  "storyTitle": "short English + Vietnamese title",
  "miniDialogueOrStory": "3-4 crisp natural English sentences weaving the focus words naturally",
  "storyTranslationVi": "natural Vietnamese translation of miniDialogueOrStory",
  "nuanceComparisons": [{"term": "word", "nuanceVi": "Vietnamese nuance explanation", "collocation": "natural English collocation"}],
  "memoryHooks": ["2-3 memorable Vietnamese+English mnemonic hooks"],
  "speakingChallengePrompt": "1 interactive speaking prompt in English with Vietnamese hint"
}`,
              },
            ],
          });

          const rawText = extractClaudeResponseText(
            claudeReply.content as Array<{ type?: string; text?: string }>
          )
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
          const parsed = JSON.parse(rawText) as ClaudeLinguistAnalysis;
          return {
            status: 'ok',
            model: claudeReply.model || claudeModel,
            data: parsed,
          };
        } catch (err: unknown) {
          return {
            status: 'error',
            model: claudeModel,
            data: null,
            message: err instanceof Error ? err.message : 'Lỗi kết nối Claude Strategist',
          };
        }
      };

      const [geminiRes, claudeRes] = await Promise.all([geminiTask(), claudeTask()]);
      const combinedVerdictVi = buildCombinedVerdict({
        cognitive: cognitiveMetrics,
        geminiOk: geminiRes.status === 'ok',
        claudeOk: claudeRes.status === 'ok',
      });

      return res.json({
        analyzedAt: new Date().toISOString(),
        cognitiveMetrics,
        providers: {
          gemini: geminiRes,
          claude: claudeRes,
          speechCoach,
        },
        combinedVerdictVi,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi phân tích đa AI';
      return res.status(502).json({ error: msg });
    }
  });

  // Real Gemini TTS (Global Male & Female AI Voices across Vietnam + 20 Countries)
  app.post('/api/speech/tts', async (req, res) => {
    try {
      const {
        text = '',
        voiceName,
        voiceGender = 'female',
        languageCode = 'vi',
        bcp47 = 'vi-VN',
        styleContext = 'language',
        vietnameseRegion = 'north',
      } = req.body as {
        text?: string;
        voiceName?: 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';
        voiceGender?: 'female' | 'male';
        languageCode?: string;
        bcp47?: string;
        styleContext?: 'fitness' | 'language' | 'assistant' | 'alarm';
        vietnameseRegion?: 'north' | 'south';
      };

      const rawText = typeof text === 'string' ? text.trim().slice(0, 600) : '';
      if (!rawText) {
        return res.status(400).json({ error: 'Thiếu văn bản cần đọc.' });
      }

      const cleanText =
        languageCode === 'vi'
          ? rawText
              .replace(/[•★☆✓✔→←↑↓✨🎵🔊🎧🎙️]/g, ', ')
              .replace(/\s*[·|]\s*/g, ', ')
              .replace(/\bBước\s*0?(\d+)\s*[:.]/gi, 'Bước $1, ')
              .replace(/(\d+)\s*[–—-]\s*(\d+)/g, '$1 đến $2')
              .replace(/(\d+(?:[.,]\d+)?)\s*kcal\b/gi, '$1 ki-lô ca-lo')
              .replace(/(\d+(?:[.,]\d+)?)\s*ml\b/gi, '$1 mi-li-lít')
              .replace(/(\d+(?:[.,]\d+)?)\s*kg\b/gi, '$1 ki-lô-gam')
              .replace(/(\d+(?:[.,]\d+)?)\s*p\b/gi, '$1 phút')
              .replace(/(\d+(?:[.,]\d+)?)\s*s\b/gi, '$1 giây')
              .replace(/\s{2,}/g, ' ')
              .trim()
          : rawText;

      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          code: 'MISSING_GEMINI_KEY',
          error: 'Gemini TTS chưa được cấu hình GEMINI_API_KEY.',
        });
      }

      const femaleVoices = ['Kore', 'Zephyr'] as const;
      const maleVoices = ['Fenrir', 'Charon', 'Puck'] as const;
      const allowedVoices = [...femaleVoices, ...maleVoices] as string[];
      const defaultGenderVoice =
        voiceGender === 'male'
          ? styleContext === 'fitness'
            ? 'Fenrir'
            : 'Charon'
          : languageCode === 'en' || languageCode === 'es' || languageCode === 'ko'
            ? 'Zephyr'
            : 'Kore';
      const chosenVoice =
        voiceName && allowedVoices.includes(voiceName) ? voiceName : defaultGenderVoice;

      const regionHint =
        languageCode === 'vi'
          ? vietnameseRegion === 'south'
            ? 'crystal-clear warm Southern Vietnamese (Saigon) accent with natural phrasing, accurate six-tone contours, and gentle comma pauses'
            : 'crystal-clear warm standard Northern Vietnamese (Hanoi) accent with natural storytelling pacing, accurate six-tone contours, and crisp syllable articulation'
          : `native ${bcp47} accent`;

      const genderDesc = voiceGender === 'male' ? 'male' : 'female';
      const styleInstruction =
        styleContext === 'fitness'
          ? `Clear, encouraging ${genderDesc} personal fitness coach with ${regionHint}.`
          : styleContext === 'alarm'
            ? `Bright, gentle ${genderDesc} wellness assistant with ${regionHint}.`
            : `Natural, articulate ${genderDesc} speaker with ${regionHint}.`;

      // Use flagship gemini-3.8-flash-tts for Vietnamese tonal accuracy & natural storytelling inflection
      const ttsModel =
        languageCode === 'vi' ? 'gemini-3.8-flash-tts' : 'gemini-3.8-flash-lite-tts';

      const response = await ai.models.generateContent({
        model: ttsModel,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: cleanText,
                speechMetadata: {
                  style: styleInstruction,
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: chosenVoice },
            },
          },
        },
      });

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      const base64Audio = inlineData?.data;
      if (!base64Audio) {
        return res.status(502).json({ error: 'Không nhận được dữ liệu âm thanh từ Gemini TTS.' });
      }

      return res.json({
        audioBase64: base64Audio,
        mimeType: inlineData?.mimeType || 'audio/wav',
        voiceName: chosenVoice,
        voiceGender,
        languageCode,
        model: ttsModel,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi Gemini TTS';
      return res.status(502).json({ error: msg });
    }
  });

  // Real AI Motion Video Generation for Home Fitness (gemini-omni-1.2-flash via Interactions API)
  app.post('/api/fitness/generate-video', async (req, res) => {
    try {
      const {
        exerciseName = 'Squat',
        exerciseNameEn = 'Bodyweight Squat',
        guideCaption = '',
        guideImage = '',
      } = req.body as {
        exerciseName?: string;
        exerciseNameEn?: string;
        guideCaption?: string;
        guideImage?: string;
      };

      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          code: 'MISSING_GEMINI_KEY',
          error:
            'Tạo video AI thực (Veo / Gemini Omni) cần GEMINI_API_KEY (gói trả phí) trong Settings > Secrets. Hiện tại bạn vẫn có thể xem Video Chuyển động AI 3D Real-time ngay bên dưới.',
        });
      }

      const safeFilename = path.basename(guideImage || '');
      const localImagePath = safeFilename
        ? path.resolve(__dirname, 'src/assets/images', safeFilename)
        : '';

      const promptText = `Create a smooth, anatomically accurate instructional home workout loop video demonstrating "${exerciseNameEn}" (${exerciseName}). ${guideCaption}. Clean modern aurora-lit fitness studio, full body centered, steady camera, natural athletic biomechanics, zero text overlays.`;

      const inputPayload:
        | string
        | Array<
            | { type: 'image'; mime_type: string; data: string }
            | { type: 'text'; text: string }
          > =
        localImagePath && fs.existsSync(localImagePath)
          ? [
              {
                type: 'image',
                mime_type: localImagePath.endsWith('.png') ? 'image/png' : 'image/jpeg',
                data: fs.readFileSync(localImagePath).toString('base64'),
              },
              {
                type: 'text',
                text: promptText,
              },
            ]
          : promptText;

      const interaction = await ai.interactions.create({
        model: 'gemini-omni-1.2-flash',
        input: inputPayload,
        background: true,
        store: false,
        response_format: {
          type: 'video',
          aspect_ratio: '16:9',
          duration: '6s',
          resolution: '720p',
        },
      });

      if (interaction.status === 'completed' && interaction.output_video?.data) {
        return res.json({
          interactionId: interaction.id,
          status: 'completed',
          videoBase64: interaction.output_video.data,
          mimeType: interaction.output_video.mime_type || 'video/mp4',
          model: 'gemini-omni-1.2-flash',
        });
      }

      return res.json({
        interactionId: interaction.id,
        status: interaction.status || 'in_progress',
        model: 'gemini-omni-1.2-flash',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi tạo video AI';
      const isTierOrQuota =
        msg.includes('403') ||
        msg.includes('402') ||
        msg.includes('429') ||
        msg.toLowerCase().includes('billing') ||
        msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('permission');
      return res.status(isTierOrQuota ? 402 : 502).json({
        code: isTierOrQuota ? 'PAID_TIER_REQUIRED' : 'VIDEO_GEN_FAILED',
        error: isTierOrQuota
          ? 'Model tạo video AI (gemini-omni-1.2-flash) yêu cầu khóa GEMINI_API_KEY gói trả phí / còn hạn mức. Bạn vẫn dùng được Video Chuyển động AI Real-time miễn phí ngay trong trình phát.'
          : `Không thể tạo video AI lúc này: ${msg}`,
      });
    }
  });

  app.get('/api/fitness/video-status/:id', async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return res.status(400).json({ error: 'Thiếu interactionId.' });
      }
      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({ code: 'MISSING_GEMINI_KEY', error: 'Thiếu GEMINI_API_KEY.' });
      }

      const interaction = await ai.interactions.get(id);
      if (interaction.status === 'completed' && interaction.output_video?.data) {
        return res.json({
          interactionId: interaction.id,
          status: 'completed',
          videoBase64: interaction.output_video.data,
          mimeType: interaction.output_video.mime_type || 'video/mp4',
        });
      }

      return res.json({
        interactionId: interaction.id,
        status: interaction.status,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi kiểm tra tiến trình video AI';
      return res.status(502).json({ error: msg });
    }
  });

  // Real Gemini Audio Transcription
  app.post('/api/speech/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType = 'audio/webm' } = req.body as {
        audioBase64?: string;
        mimeType?: string;
      };
      if (!audioBase64) {
        return res.status(400).json({ error: 'Thiếu dữ liệu âm thanh.' });
      }
      const ai = createGeminiClient();
      if (!ai) {
        return res.status(503).json({
          code: 'MISSING_GEMINI_KEY',
          error: 'Nhận diện giọng nói máy chủ cần GEMINI_API_KEY.',
        });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            { inlineData: { mimeType, data: audioBase64 } },
            { text: 'Transcribe this audio accurately in its spoken language.' },
          ],
        },
      });

      return res.json({
        transcript: (response.text || '').trim(),
        model: 'gemini-3.5-transcribe',
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi chuyển giọng nói thành văn bản';
      return res.status(502).json({ error: msg });
    }
  });

  // Optional Community XP Leaderboard
  app.get('/api/leaderboard', (_req, res) => {
    const sorted = [...leaderboardEntries].sort((a, b) => b.xp - a.xp).slice(0, 15);
    res.json({ entries: sorted });
  });

  app.post('/api/leaderboard', (req, res) => {
    const { id, name, xp, level, streakDays } = req.body as Partial<LeaderboardEntry>;
    const cleanName = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    if (!cleanName) {
      return res.status(400).json({ error: 'Cần tên hiển thị để tham gia bảng xếp hạng.' });
    }
    const entryId = (typeof id === 'string' && id.trim()) || `player-${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const nextEntry: LeaderboardEntry = {
      id: entryId,
      name: cleanName,
      xp: Math.max(0, Number(xp) || 0),
      level: Math.max(1, Number(level) || 1),
      streakDays: Math.max(0, Number(streakDays) || 0),
      updatedAt: new Date().toISOString(),
    };
    const existingIdx = leaderboardEntries.findIndex((e) => e.id === entryId);
    if (existingIdx >= 0) {
      leaderboardEntries[existingIdx] = nextEntry;
    } else {
      leaderboardEntries.push(nextEntry);
    }
    leaderboardEntries = leaderboardEntries.sort((a, b) => b.xp - a.xp).slice(0, 30);
    saveLeaderboard(leaderboardEntries);
    return res.json({ entries: leaderboardEntries.slice(0, 15) });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AI Life World server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start AI Life World server:', err);
  process.exit(1);
});
