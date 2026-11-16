import React, { useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Check,
  Copy,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  Sparkles,
  Volume2,
} from 'lucide-react';
import type {
  AppPersistentState,
  AssistantChatMessage,
  AssistantPersonaId,
  UiLanguage,
} from '../types/lifeworld';
import {
  CLAUDE_CONTENT_TEMPLATES,
  type ClaudeContentLength,
  type ClaudeContentTemplateId,
  type ClaudeContentTone,
} from '../utils/claudeContent';
import { calculateTdeeAndTarget, sumDailyNutrition } from '../utils/healthEngine';

interface AiAssistantViewProps {
  state: AppPersistentState;
  uiLang: UiLanguage;
  aiConfigured: boolean;
  claudeConfigured?: boolean;
  onToggleAiPersonalData: () => void;
  onGrantMicrophone: () => void;
  onOpenSecurityProfile: () => void;
}

const PERSONAS: Array<{
  id: AssistantPersonaId;
  titleVi: string;
  titleEn: string;
  descVi: string;
  samplePrompts: string[];
}> = [
  {
    id: 'general',
    titleVi: 'Trợ lý Tổng hợp',
    titleEn: 'General AI',
    descVi: 'Điều phối mục tiêu sức khỏe, học tập và thói quen hàng ngày.',
    samplePrompts: [
      'Hãy tóm tắt kế hoạch 1 ngày cân bằng giữa làm việc, vận động và ngủ ngon.',
      'Tôi hay mệt buổi chiều, cần điều chỉnh thói quen gì?',
    ],
  },
  {
    id: 'fitness',
    titleVi: 'AI Fitness Coach',
    titleEn: 'Fitness Coach',
    descVi: 'Lên lịch tập tại nhà, phân tích kỹ thuật squat, plank, push-up an toàn.',
    samplePrompts: [
      'Thiết kế lịch tập 20 phút không dụng cụ cho người mới bắt đầu.',
      'Cách kiểm tra lỗi võng lưng khi tập Plank tại nhà?',
    ],
  },
  {
    id: 'yoga',
    titleVi: 'AI Yoga Coach',
    titleEn: 'Yoga Coach',
    descVi: 'Hướng dẫn chuỗi tư thế theo nhịp thở, giảm đau cổ vai gáy.',
    samplePrompts: [
      'Gợi ý 4 tư thế Yoga 10 phút giúp giảm căng cứng lưng dưới.',
      'Hướng dẫn nhịp thở khi thực hiện chuỗi Chào Mặt Trời.',
    ],
  },
  {
    id: 'nutrition',
    titleVi: 'AI Nutritionist',
    titleEn: 'Nutritionist',
    descVi: 'Phân tích calo, macro và thực đơn khoa học dựa trên dữ liệu tin cậy.',
    samplePrompts: [
      'Gợi ý thực đơn 1 ngày đủ đạm khoảng 1800 kcal với nguyên liệu Việt Nam.',
      'Nên ăn gì trước và sau khi tập cardio 30 phút?',
    ],
  },
  {
    id: 'language',
    titleVi: 'AI Language Tutor',
    titleEn: 'Language Tutor',
    descVi: 'Luyện hội thoại, sửa phát âm và ngữ pháp nhiều ngôn ngữ.',
    samplePrompts: [
      'Hãy đóng vai lễ tân khách sạn và luyện hội thoại tiếng Anh trình độ B1 với tôi.',
      'Phân biệt cách dùng "affect" và "effect" kèm ví dụ ngắn.',
    ],
  },
  {
    id: 'study',
    titleVi: 'AI Study Assistant',
    titleEn: 'Study Assistant',
    descVi: 'Phân tích bài học theo từng bước tư duy, tóm tắt kiến thức.',
    samplePrompts: [
      'Áp dụng phương pháp Feynman để giải thích cách tính BMR và TDEE.',
      'Cách kết hợp Pomodoro 25/5 và Active Recall khi ôn thi.',
    ],
  },
  {
    id: 'wellness',
    titleVi: 'AI Wellness Companion',
    titleEn: 'Wellness Companion',
    descVi: 'Đồng hành quản lý căng thẳng, hít thở và chăm sóc giấc ngủ.',
    samplePrompts: [
      'Hướng dẫn tôi thư giãn trong 3 phút trước khi ngủ.',
      'Làm sao duy trì động lực tập luyện khi bận rộn?',
    ],
  },
  {
    id: 'planner',
    titleVi: 'AI Daily Planner',
    titleEn: 'Daily Planner',
    descVi: 'Sắp xếp thời gian biểu uống nước, vận động và nghỉ ngơi.',
    samplePrompts: [
      'Lập khung giờ nhắc uống nước và đứng dậy vận động cho dân văn phòng 8h-17h.',
      'Tối ưu lịch sinh hoạt nếu tôi thức dậy lúc 06:30.',
    ],
  },
];

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  state,
  uiLang,
  aiConfigured,
  claudeConfigured = false,
  onToggleAiPersonalData,
  onGrantMicrophone,
  onOpenSecurityProfile,
}) => {
  const [workspaceMode, setWorkspaceMode] = useState<'chat' | 'claude_studio'>('chat');
  const [chatProvider, setChatProvider] = useState<'gemini' | 'claude'>('gemini');
  const [persona, setPersona] = useState<AssistantPersonaId>('general');
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Claude Content Studio state
  const [studioTemplate, setStudioTemplate] = useState<ClaudeContentTemplateId>('workout_guide');
  const [studioTone, setStudioTone] = useState<ClaudeContentTone>('coach');
  const [studioLength, setStudioLength] = useState<ClaudeContentLength>('medium');
  const [studioTopic, setStudioTopic] = useState('');
  const [studioLoading, setStudioLoading] = useState(false);
  const [studioResult, setStudioResult] = useState<{ content: string; model: string } | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);
  const [studioCopied, setStudioCopied] = useState(false);

  const activePersona = PERSONAS.find((p) => p.id === persona) || PERSONAS[0];
  const activeTemplateMeta =
    CLAUDE_CONTENT_TEMPLATES.find((t) => t.id === studioTemplate) || CLAUDE_CONTENT_TEMPLATES[0];

  const buildSanitizedPersonalContext = () => {
    if (!state.permissions.allowAiPersonalData) return null;
    const { tdee, targetCalories } = calculateTdeeAndTarget(state.profile);
    const intake = sumDailyNutrition(state.meals);
    return {
      displayName: state.profile.displayName,
      age: state.profile.age,
      heightCm: state.profile.heightCm,
      weightKg: state.profile.weightKg,
      goal: state.profile.goal,
      activityLevel: state.profile.activityLevel,
      targetCalories,
      tdee,
      todayNutrition: intake,
      waterMlToday: state.waterMlToday,
      dailyWaterGoalMl: state.profile.dailyWaterGoalMl,
      targetLanguage: state.profile.targetLanguageCode,
      languageLevel: state.profile.languageLevel,
    };
  };

  const sendMessage = async (textToSend: string) => {
    const clean = textToSend.trim();
    if (!clean || loading) return;

    const userMsg: AssistantChatMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      persona,
      text: clean,
      createdAt: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          persona,
          provider: chatProvider,
          message: clean,
          history: nextHistory
            .filter((m) => !m.error)
            .slice(-6)
            .map((m) => ({ role: m.role, text: m.text })),
          uiLanguage: uiLang,
          personalContext: buildSanitizedPersonalContext(),
        }),
      });
      const json = await resp.json();
      if (!resp.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-err-${Date.now()}`,
            role: 'assistant',
            persona,
            text:
              json.error ||
              (chatProvider === 'claude'
                ? 'Không thể kết nối máy chủ Claude. Vui lòng kiểm tra ANTHROPIC_API_KEY.'
                : 'Không thể kết nối máy chủ AI Gemini. Vui lòng kiểm tra GEMINI_API_KEY.'),
            createdAt: new Date().toISOString(),
            error: true,
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-a-${Date.now()}`,
            role: 'assistant',
            persona,
            text: json.reply,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-net-${Date.now()}`,
          role: 'assistant',
          persona,
          text: 'Lỗi kết nối mạng tới máy chủ NexaLife OS.',
          createdAt: new Date().toISOString(),
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const generateClaudeStudioContent = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (studioLoading) return;
    const topic = studioTopic.trim();
    if (!topic) {
      setStudioError('Vui lòng nhập chủ đề hoặc yêu cầu để Claude biên soạn.');
      return;
    }
    setStudioLoading(true);
    setStudioError(null);
    setStudioCopied(false);
    try {
      const resp = await fetch('/api/claude/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: studioTemplate,
          topic,
          tone: studioTone,
          length: studioLength,
          language: uiLang,
        }),
      });
      const json = (await resp.json()) as {
        content?: string;
        model?: string;
        error?: string;
      };
      if (!resp.ok) {
        setStudioError(json.error || 'Không thể tạo nội dung từ Claude API.');
      } else {
        setStudioResult({
          content: json.content || '',
          model: json.model || 'claude-sonnet-4-5',
        });
      }
    } catch {
      setStudioError('Lỗi kết nối tới máy chủ NexaLife OS.');
    } finally {
      setStudioLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage(input);
  };

  const speakAssistantReply = async (msgId: string, text: string) => {
    const { speakWithAiVoice } = await import('../utils/voiceEngine');
    const langCode = uiLang === 'en' ? 'en' : 'vi';
    await speakWithAiVoice({
      text: text.slice(0, 500),
      languageCode: langCode,
      bcp47: uiLang === 'en' ? 'en-US' : 'vi-VN',
      gender: state.profile.aiVoiceGender || 'female',
      voiceNameOverride: state.profile.aiVoiceName,
      styleContext: 'assistant',
      vietnameseRegion: state.profile.vietnameseRegion || 'north',
      onStart: () => setSpeakingId(msgId),
      onEnd: () => setSpeakingId(null),
    });
  };

  const toggleVoiceDictation = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    if (!state.permissions.microphone) {
      onGrantMicrophone();
    }

    // Prefer native Web Speech API if available for instant live transcript, else MediaRecorder + /api/speech/transcribe
    const SpeechRec =
      (window as unknown as { SpeechRecognition?: new () => unknown; webkitSpeechRecognition?: new () => unknown })
        .SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => unknown }).webkitSpeechRecognition;

    if (SpeechRec) {
      const recognition = new SpeechRec() as {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
      recognition.lang = uiLang === 'en' ? 'en-US' : 'vi-VN';
      recognition.interimResults = false;
      setRecording(true);
      recognition.onresult = (event) => {
        const text = event.results?.[0]?.[0]?.transcript || '';
        if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
      };
      recognition.onerror = () => setRecording(false);
      recognition.onend = () => setRecording(false);
      recognition.start();
      return;
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        audioChunksRef.current = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
        };
        recorder.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = String(reader.result || '').split(',')[1] || '';
            if (!base64) return;
            try {
              const resp = await fetch('/api/speech/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audioBase64: base64, mimeType: 'audio/webm' }),
              });
              const json = await resp.json();
              if (resp.ok && json.transcript) {
                setInput((prev) => (prev ? `${prev} ${json.transcript}` : json.transcript));
              }
            } catch {
              // ignore
            }
          };
          reader.readAsDataURL(blob);
        };
        mediaRecorderRef.current = recorder;
        recorder.start();
        setRecording(true);
      } catch {
        setRecording(false);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Status & Privacy Consent Strip */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-stone-200/90 bg-white/95 p-5 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            {uiLang === 'vi'
              ? 'Trợ lý AI Đa Chuyên gia · Gemini & Studio Tạo nội dung Claude'
              : 'Multi-Expert AI Assistant & Claude Content Studio'}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {aiConfigured ? 'Gemini API: Sẵn sàng' : 'Gemini API: Thiếu GEMINI_API_KEY'} ·{' '}
            {claudeConfigured ? 'Claude API: Sẵn sàng' : 'Claude API: Thiếu ANTHROPIC_API_KEY'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-stone-200 bg-stone-100 p-0.5 dark:border-zinc-700 dark:bg-[#0A0B0E]">
            <button
              type="button"
              onClick={() => setWorkspaceMode('chat')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                workspaceMode === 'chat'
                  ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span>Hội thoại Chuyên gia</span>
            </button>
            <button
              type="button"
              onClick={() => setWorkspaceMode('claude_studio')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                workspaceMode === 'claude_studio'
                  ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Studio Tạo nội dung Claude</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleAiPersonalData}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              state.permissions.allowAiPersonalData
                ? 'border-orange-500 bg-orange-50 text-orange-900 dark:border-[#FF6B1A] dark:bg-orange-950/35 dark:text-orange-200'
                : 'border-stone-200 text-zinc-700 hover:bg-stone-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>
              Chỉ số cá nhân: {state.permissions.allowAiPersonalData ? 'Bật' : 'Tắt'}
            </span>
          </button>
          <button
            type="button"
            onClick={onOpenSecurityProfile}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Quản lý quyền
          </button>
        </div>
      </section>

      {workspaceMode === 'chat' && chatProvider === 'gemini' && !aiConfigured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <div className="font-semibold">AI Backend chưa có GEMINI_API_KEY</div>
            <p className="mt-0.5 text-xs leading-relaxed">
              Để sử dụng trò chuyện trực tiếp qua Gemini, hãy thiết lập biến môi trường{' '}
              <code className="font-mono font-semibold">GEMINI_API_KEY</code> trong{' '}
              <strong>Settings &gt; Secrets</strong> của AI Studio rồi khởi động lại máy chủ.
            </p>
          </div>
        </div>
      )}

      {(workspaceMode === 'claude_studio' || chatProvider === 'claude') && !claudeConfigured && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <div className="font-semibold">Claude API chưa có ANTHROPIC_API_KEY</div>
            <p className="mt-0.5 text-xs leading-relaxed">
              Để Claude tạo giáo án, thực đơn, bài học và kịch bản nội dung thực, hãy thêm{' '}
              <code className="font-mono font-semibold">ANTHROPIC_API_KEY</code> vào{' '}
              <strong>Settings &gt; Secrets</strong> của AI Studio rồi khởi động lại máy chủ.
            </p>
          </div>
        </div>
      )}

      {workspaceMode === 'claude_studio' ? (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Template Selector */}
          <aside className="space-y-2 lg:col-span-4">
            <div className="rounded-xl border border-stone-200/90 bg-white/95 p-4 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Mẫu Tạo nội dung Claude
              </h2>
              <div className="mt-3 space-y-2">
                {CLAUDE_CONTENT_TEMPLATES.map((tpl) => {
                  const active = tpl.id === studioTemplate;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => setStudioTemplate(tpl.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        active
                          ? 'border-orange-500 bg-orange-50 dark:border-[#FF6B1A] dark:bg-orange-950/35'
                          : 'border-stone-200 hover:bg-stone-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {tpl.labelVi}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {tpl.descriptionVi}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>

          {/* Studio Editor & Output */}
          <section className="space-y-4 rounded-xl border border-stone-200/90 bg-white/95 p-5 lg:col-span-8 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-orange-600 dark:text-[#FF6B1A]" />
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {activeTemplateMeta.labelVi}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Biên soạn nội dung bằng Anthropic Claude (/api/claude/generate)
                  </div>
                </div>
              </div>
            </div>

            <form onSubmit={(e) => void generateClaudeStudioContent(e)} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Giọng văn
                  <select
                    value={studioTone}
                    onChange={(e) => setStudioTone(e.target.value as ClaudeContentTone)}
                    className="mt-1 w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-[#0A0B0E] dark:text-zinc-100"
                  >
                    <option value="coach">Huấn luyện viên (Thực tế, dứt khoát)</option>
                    <option value="friendly">Thân thiện, dễ hiểu</option>
                    <option value="academic">Phân tích khoa học & giải phẫu</option>
                    <option value="concise">Cô đọng, danh sách hành động</option>
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Độ dài nội dung
                  <select
                    value={studioLength}
                    onChange={(e) => setStudioLength(e.target.value as ClaudeContentLength)}
                    className="mt-1 w-full rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-[#0A0B0E] dark:text-zinc-100"
                  >
                    <option value="short">Ngắn gọn (~200 từ)</option>
                    <option value="medium">Tiêu chuẩn (~450 từ)</option>
                    <option value="detailed">Chuyên sâu (~800 từ)</option>
                  </select>
                </label>
              </div>

              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                Yêu cầu & Chủ đề tạo nội dung
                <textarea
                  rows={4}
                  value={studioTopic}
                  onChange={(e) => setStudioTopic(e.target.value)}
                  placeholder={activeTemplateMeta.placeholderVi}
                  className="mt-1 w-full rounded-lg border border-stone-300/90 bg-white p-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-[#0A0B0E] dark:text-zinc-100 dark:placeholder:text-zinc-500"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStudioTopic(activeTemplateMeta.placeholderVi.replace(/^Ví dụ:\s*/i, ''))}
                  className="text-xs font-medium text-orange-600 hover:underline dark:text-[#FF6B1A]"
                >
                  Điền nhanh gợi ý mẫu
                </button>
                <button
                  type="submit"
                  disabled={studioLoading || !studioTopic.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50 dark:bg-[#FF6B1A] dark:text-zinc-950"
                >
                  {studioLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  <span>{studioLoading ? 'Claude đang tạo nội dung...' : 'Tạo nội dung với Claude'}</span>
                </button>
              </div>
            </form>

            {studioError && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                {studioError}
              </div>
            )}

            {studioResult && (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm dark:border-zinc-800 dark:bg-[#0D0F14]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5 dark:border-zinc-800">
                  <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    Kết quả từ Claude ({studioResult.model})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(studioResult.content);
                        setStudioCopied(true);
                        window.setTimeout(() => setStudioCopied(false), 1800);
                      }}
                      className="inline-flex items-center gap-1 rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      {studioCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      <span>{studioCopied ? 'Đã sao chép' : 'Sao chép'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void speakAssistantReply('studio', studioResult.content)}
                      className="inline-flex items-center gap-1 rounded border border-orange-500/40 bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-500/20 dark:text-orange-300"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>{speakingId === 'studio' ? 'Đang đọc...' : 'Nghe giọng AI'}</span>
                    </button>
                  </div>
                </div>
                <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
                  {studioResult.content}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Persona Selector */}
        <aside className="space-y-2 lg:col-span-4">
          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-4 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Chọn 8 Chuyên gia AI
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {PERSONAS.map((p) => {
                const active = p.id === persona;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPersona(p.id)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      active
                        ? 'border-orange-500 bg-orange-50 dark:border-[#FF6B1A] dark:bg-orange-950/35'
                        : 'border-stone-200 hover:bg-stone-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60'
                    }`}
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {uiLang === 'vi' ? p.titleVi : p.titleEn}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{p.descVi}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Chat Workspace */}
        <section className="flex flex-col rounded-xl border border-stone-200/90 bg-white/95 lg:col-span-8 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <Bot className="h-5 w-5 text-orange-600 dark:text-[#FF6B1A]" />
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {uiLang === 'vi' ? activePersona.titleVi : activePersona.titleEn}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Động cơ: {chatProvider === 'claude' ? 'Anthropic Claude' : 'Google Gemini'} · Giọng đọc:{' '}
                  {state.profile.aiVoiceName}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-md border border-stone-200 bg-stone-100 p-0.5 dark:border-zinc-700 dark:bg-[#0A0B0E]">
                <button
                  type="button"
                  onClick={() => setChatProvider('gemini')}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    chatProvider === 'gemini'
                      ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
                  }`}
                >
                  Gemini
                </button>
                <button
                  type="button"
                  onClick={() => setChatProvider('claude')}
                  className={`rounded px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    chatProvider === 'claude'
                      ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                      : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white'
                  }`}
                >
                  Claude
                </button>
              </div>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMessages([])}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  Xóa hội thoại
                </button>
              )}
            </div>
          </div>

          {/* Conversation Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5 min-h-[340px] max-h-[520px]">
            {messages.length === 0 ? (
              <div className="space-y-4 py-6">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Chọn câu hỏi gợi ý bên dưới hoặc nhập yêu cầu của bạn bằng văn bản / micro:
                </p>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {activePersona.samplePrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => void sendMessage(prompt)}
                      className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-left text-xs leading-relaxed text-zinc-700 hover:border-orange-500 hover:bg-orange-50/60 dark:border-zinc-800 dark:bg-[#0D0F14] dark:text-zinc-300 dark:hover:border-[#FF6B1A]"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-zinc-900 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                        : m.error
                          ? 'border border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100'
                          : 'border border-stone-200 bg-stone-50 text-zinc-800 dark:border-zinc-800 dark:bg-[#0D0F14] dark:text-zinc-200'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.text}</div>
                    {m.role === 'assistant' && !m.error && (
                      <div className="mt-2 flex items-center justify-end gap-2 border-t border-slate-200/70 pt-2 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => void speakAssistantReply(m.id, m.text)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 hover:underline dark:text-[#FF6B1A]"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          <span>{speakingId === m.id ? 'Đang đọc...' : 'Nghe giọng AI'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {loading && (
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Đang phân tích phản hồi từ Gemini...
              </div>
            )}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-slate-200 p-4 dark:border-slate-800"
          >
            <button
              type="button"
              onClick={() => void toggleVoiceDictation()}
              aria-label={recording ? 'Dừng thu âm' : 'Nói vào micro'}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                recording
                  ? 'border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Hỏi ${activePersona.titleVi} (${chatProvider === 'claude' ? 'Claude' : 'Gemini'})...`}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-orange-600 px-4 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50 dark:bg-[#FF6B1A] dark:text-zinc-950"
            >
              <Send className="h-4 w-4" />
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        </section>
      </div>
      )}
    </div>
  );
};
