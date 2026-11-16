import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  Clock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Volume2,
} from 'lucide-react';
import type { ScheduleRoutineItem, TimerMode, VoiceGender } from '../types/lifeworld';
import { soundEngine } from '../utils/soundEngine';
import { speakWithAiVoice } from '../utils/voiceEngine';

interface SmartTimerViewProps {
  schedules: ScheduleRoutineItem[];
  wakeTime: string;
  sleepTime: string;
  aiVoiceGender?: VoiceGender;
  vietnameseRegion?: 'north' | 'south';
  onAddSchedule: (item: Omit<ScheduleRoutineItem, 'id'>) => void;
  onToggleSchedule: (id: string) => void;
  onDeleteSchedule: (id: string) => void;
  onUpdateSleepSchedule: (wakeTime: string, sleepTime: string) => void;
  onCompleteSession: (mode: TimerMode, minutes: number) => void;
}

const MODE_PRESETS: Array<{ id: TimerMode; label: string; defaultSeconds: number; note: string }> = [
  { id: 'clock', label: 'Đồng hồ thực', defaultSeconds: 0, note: 'Hiển thị giờ hệ thống & nhắc lịch sinh hoạt' },
  { id: 'pomodoro', label: 'Pomodoro', defaultSeconds: 25 * 60, note: '25 phút tập trung sâu · 5 phút nghỉ' },
  { id: 'countdown', label: 'Đếm ngược', defaultSeconds: 10 * 60, note: 'Tùy chỉnh thời gian đếm ngược linh hoạt' },
  { id: 'stopwatch', label: 'Bấm giờ', defaultSeconds: 0, note: 'Đo thời gian thực & ghi vòng (Lap)' },
  { id: 'workout', label: 'Tập luyện', defaultSeconds: 20 * 60, note: 'Bộ đếm hiệp tập thể chất tại nhà' },
  { id: 'yoga', label: 'Yoga & Thiền', defaultSeconds: 15 * 60, note: 'Chuông nhẹ nhàng khi kết thúc buổi tập' },
  { id: 'rest', label: 'Nghỉ ngơi', defaultSeconds: 5 * 60, note: 'Thư giãn mắt, uống nước & giãn vai' },
];

export const SmartTimerView: React.FC<SmartTimerViewProps> = ({
  schedules,
  wakeTime,
  sleepTime,
  aiVoiceGender = 'female',
  vietnameseRegion = 'north',
  onAddSchedule,
  onToggleSchedule,
  onDeleteSchedule,
  onUpdateSleepSchedule,
  onCompleteSession,
}) => {
  const [now, setNow] = useState(() => new Date());
  const [mode, setMode] = useState<TimerMode>('pomodoro');
  const [customMinutes, setCustomMinutes] = useState(25);
  const [secondsValue, setSecondsValue] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<string[]>([]);
  const [alarmNotice, setAlarmNotice] = useState<string | null>(null);
  const [voiceAlarmEnabled, setVoiceAlarmEnabled] = useState(true);

  const [sedentaryIntervalMin, setSedentaryIntervalMin] = useState(45);
  const [waterIntervalMin, setWaterIntervalMin] = useState(60);
  const [newTime, setNewTime] = useState('14:00');
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<ScheduleRoutineItem['category']>('water');

  const lastCheckedMinuteRef = useRef<string>('');

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = new Date();
      setNow(current);
      const hhmm = `${String(current.getHours()).padStart(2, '0')}:${String(current.getMinutes()).padStart(2, '0')}`;
      if (lastCheckedMinuteRef.current !== hhmm) {
        lastCheckedMinuteRef.current = hhmm;
        const matched = schedules.find((s) => s.enabled && s.time === hhmm);
        if (matched) {
          triggerAlarm(`Nhắc lịch ${hhmm}: ${matched.title}`, matched.voiceAlert);
        }
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [schedules]);

  useEffect(() => {
    if (!running || mode === 'clock') return;
    const id = window.setInterval(() => {
      setSecondsValue((prev) => {
        if (mode === 'stopwatch') {
          return prev + 1;
        }
        if (prev <= 1) {
          setRunning(false);
          const completedMin = Math.max(1, Math.round(customMinutes));
          onCompleteSession(mode, completedMin);
          triggerAlarm(`Hoàn thành phiên ${MODE_PRESETS.find((m) => m.id === mode)?.label || mode}!`, voiceAlarmEnabled);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, mode, customMinutes, voiceAlarmEnabled]);

  const triggerAlarm = (message: string, speak: boolean) => {
    setAlarmNotice(message);
    soundEngine.playAlarmChime();
    if (speak) {
      void speakWithAiVoice({
        text: message,
        languageCode: 'vi',
        bcp47: 'vi-VN',
        gender: aiVoiceGender,
        styleContext: 'alarm',
        vietnameseRegion,
      });
    }
  };

  const selectMode = (nextMode: TimerMode) => {
    setRunning(false);
    setMode(nextMode);
    setLaps([]);
    setAlarmNotice(null);
    const preset = MODE_PRESETS.find((p) => p.id === nextMode);
    const defaultSec = preset ? preset.defaultSeconds : 600;
    setCustomMinutes(Math.max(1, Math.round(defaultSec / 60)));
    setSecondsValue(nextMode === 'stopwatch' ? 0 : defaultSec);
  };

  const applyCustomMinutes = (mins: number) => {
    const safe = Math.max(1, Math.min(180, mins));
    setCustomMinutes(safe);
    setRunning(false);
    setSecondsValue(safe * 60);
  };

  const formatTimer = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleAddSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newTitle.trim();
    if (!clean) return;
    onAddSchedule({
      time: newTime,
      title: clean,
      category: newCategory,
      enabled: true,
      voiceAlert: true,
    });
    setNewTitle('');
  };

  const activePreset = MODE_PRESETS.find((m) => m.id === mode);

  return (
    <div className="space-y-6">
      {/* Mode Selector Bar */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200/90 bg-white/95 p-2 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
        {MODE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => selectMode(preset.id)}
            className={`rounded-lg px-3.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              mode === preset.id
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {alarmNotice && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <div className="flex items-center gap-2 font-medium">
            <Bell className="h-4 w-4 shrink-0" />
            <span>{alarmNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setAlarmNotice(null)}
            className="text-xs font-semibold underline"
          >
            Đã hiểu
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Timer Instrument */}
        <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-7 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                {activePreset?.label}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">{activePreset?.note}</p>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={voiceAlarmEnabled}
                onChange={(e) => setVoiceAlarmEnabled(e.target.checked)}
                className="rounded border-stone-300 accent-orange-600 text-orange-600 dark:accent-[#FF6B1A]"
              />
              <span>Báo giọng nói AI</span>
            </label>
          </div>

          <div className="my-8 flex flex-col items-center justify-center rounded-xl border border-stone-200 bg-stone-50 py-10 dark:border-zinc-800 dark:bg-[#0D0F14]">
            {mode === 'clock' ? (
              <>
                <div className="font-mono text-5xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-6xl dark:text-slate-100">
                  {now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
                <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  {now.toLocaleDateString('vi-VN', {
                    weekday: 'long',
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-5xl font-bold tracking-tight text-slate-900 tabular-nums sm:text-6xl dark:text-slate-100">
                  {formatTimer(secondsValue)}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {running ? 'Đang chạy' : 'Sẵn sàng'}
                </div>
              </>
            )}

            {mode !== 'clock' && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setRunning((r) => !r)}
                  className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950 dark:hover:bg-[#ff7f38]"
                >
                  {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  <span>{running ? 'Tạm dừng' : 'Bắt đầu'}</span>
                </button>

                {mode === 'stopwatch' && (
                  <button
                    type="button"
                    onClick={() => setLaps((prev) => [formatTimer(secondsValue), ...prev])}
                    className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-[#1A1D26] dark:text-zinc-200"
                  >
                    Ghi vòng (Lap)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setRunning(false);
                    setLaps([]);
                    setSecondsValue(mode === 'stopwatch' ? 0 : customMinutes * 60);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-stone-100 dark:border-zinc-700 dark:bg-[#1A1D26] dark:text-zinc-200"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Đặt lại</span>
                </button>
              </div>
            )}
          </div>

          {mode !== 'clock' && mode !== 'stopwatch' && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span>Thời lượng (phút):</span>
                {[5, 15, 25, 45, 50].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => applyCustomMinutes(m)}
                    className={`rounded-md px-2.5 py-1 font-mono text-xs ${
                      customMinutes === m
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => triggerAlarm('Kiểm tra chuông báo & giọng nói NexaLife OS.', voiceAlarmEnabled)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:underline dark:text-[#FF6B1A]"
              >
                <Volume2 className="h-3.5 w-3.5" />
                <span>Thử chuông & giọng AI</span>
              </button>
            </div>
          )}

          {mode === 'stopwatch' && laps.length > 0 && (
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">Các vòng đã ghi</h3>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {laps.map((lap, i) => (
                  <div
                    key={`${lap}-${i}`}
                    className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-1.5 font-mono text-xs tabular-nums dark:border-slate-800"
                  >
                    <span className="text-slate-500">#{laps.length - i}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{lap}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Smart Health Reminders & Daily Routine */}
        <section className="space-y-6 lg:col-span-5">
          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Nhắc nhở Sinh học & Giấc ngủ
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400">Giờ thức dậy</span>
                <input
                  type="time"
                  value={wakeTime}
                  onChange={(e) => onUpdateSleepSchedule(e.target.value, sleepTime)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400">Giờ đi ngủ</span>
                <input
                  type="time"
                  value={sleepTime}
                  onChange={(e) => onUpdateSleepSchedule(wakeTime, e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400">Nhắc uống nước (phút)</span>
                <input
                  type="number"
                  min={15}
                  max={180}
                  value={waterIntervalMin}
                  onChange={(e) => setWaterIntervalMin(Number(e.target.value) || 60)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-500 dark:text-slate-400">Nhắc đứng dậy (phút)</span>
                <input
                  type="number"
                  min={15}
                  max={120}
                  value={sedentaryIntervalMin}
                  onChange={(e) => setSedentaryIntervalMin(Number(e.target.value) || 45)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Lịch trình Sinh hoạt Cá nhân
              </h2>
              <Clock className="h-4 w-4 text-slate-400" />
            </div>

            <form onSubmit={handleAddSchedule} className="mt-4 space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  aria-label="Giờ nhắc"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as ScheduleRoutineItem['category'])}
                  aria-label="Loại lịch"
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="water">Uống nước</option>
                  <option value="move">Vận động</option>
                  <option value="workout">Tập luyện</option>
                  <option value="study">Học tập</option>
                  <option value="meditation">Thiền định</option>
                  <option value="meal">Bữa ăn</option>
                  <option value="sleep">Giấc ngủ</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: Uống 250ml nước & vươn vai..."
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-[#FF6B1A] dark:text-zinc-950"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Thêm</span>
                </button>
              </div>
            </form>

            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {schedules.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <label className="flex min-w-0 flex-1 items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => onToggleSchedule(item.id)}
                      className="rounded border-stone-300 accent-orange-600 text-orange-600 dark:accent-[#FF6B1A]"
                    />
                    <span className="font-mono text-xs font-semibold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                      {item.time}
                    </span>
                    <span
                      className={`truncate text-sm ${
                        item.enabled
                          ? 'text-slate-800 dark:text-slate-200'
                          : 'text-slate-400 line-through dark:text-slate-500'
                      }`}
                    >
                      {item.title}
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => onDeleteSchedule(item.id)}
                    aria-label={`Xóa lịch ${item.title}`}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
