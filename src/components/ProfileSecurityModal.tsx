import React, { useEffect, useState } from 'react';
import {
  Cloud,
  Download,
  KeyRound,
  LogOut,
  Shield,
  Sliders,
  Trash2,
  UserCheck,
  Volume2,
  X,
} from 'lucide-react';
import { GLOBAL_LANGUAGES } from '../data/languages';
import type {
  ActivityLevel,
  AppPersistentState,
  BiologicalSex,
  CefrLevel,
  FitnessGoal,
  UserPermissions,
  UserPersonalProfile,
} from '../types/lifeworld';
import { getOrCreateAesKey, rotateDeviceAesKey } from '../utils/cryptoVault';
import {
  registerWithEmailPassword,
  signInWithEmailPassword,
  signInWithGooglePopup,
  signOutFirebaseSession,
  type DatabaseConnectionState,
  type UnifiedAuthUser,
} from '../utils/firebase';
import { calculateTdeeAndTarget, computeBmi } from '../utils/healthEngine';
import { speakWithAiVoice } from '../utils/voiceEngine';

interface ProfileSecurityModalProps {
  open: boolean;
  onClose: () => void;
  state: AppPersistentState;
  authUser: UnifiedAuthUser | null;
  dbStatus: DatabaseConnectionState;
  onUpdateProfile: (patch: Partial<UserPersonalProfile>) => void;
  onUpdatePermissions: (patch: Partial<UserPermissions>) => void;
  onSyncCloudNow: () => Promise<void>;
  onPullCloudNow: () => Promise<void>;
  onExportJson: () => void;
  onDeleteAllData: () => Promise<void>;
  onLogSecurityAction: (action: string, detail: string) => void;
}

export const ProfileSecurityModal: React.FC<ProfileSecurityModalProps> = ({
  open,
  onClose,
  state,
  authUser,
  dbStatus,
  onUpdateProfile,
  onUpdatePermissions,
  onSyncCloudNow,
  onPullCloudNow,
  onExportJson,
  onDeleteAllData,
  onLogSecurityAction,
}) => {
  const [tab, setTab] = useState<'profile' | 'account' | 'security'>('profile');
  const [keyFingerprint, setKeyFingerprint] = useState<string>('...');
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [nameInput, setNameInput] = useState(state.profile.displayName);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    void getOrCreateAesKey().then((res) => {
      if (res) setKeyFingerprint(res.fingerprint);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const { bmr, tdee, targetCalories } = calculateTdeeAndTarget(state.profile);
  const bmi = computeBmi(state.profile.weightKg, state.profile.heightCm);

  const handleGoogleSignIn = async () => {
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      await signInWithGooglePopup();
      onLogSecurityAction('Đăng nhập Google OAuth', 'Kích hoạt đồng bộ Cloud Firestore');
      setAuthMessage('Đăng nhập Google thành công.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể đăng nhập Google.';
      setAuthMessage(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || passwordInput.length < 6) {
      setAuthMessage('Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.');
      return;
    }
    setAuthBusy(true);
    setAuthMessage(null);
    try {
      if (authMode === 'login') {
        await signInWithEmailPassword(emailInput, passwordInput);
        onLogSecurityAction('Đăng nhập Email', emailInput);
        setAuthMessage('Đăng nhập thành công.');
      } else {
        await registerWithEmailPassword(emailInput, passwordInput, nameInput || 'Thành viên');
        onLogSecurityAction('Tạo tài khoản Email', emailInput);
        setAuthMessage('Đã tạo tài khoản và đăng nhập thành công.');
      }
      setPasswordInput('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi xác thực Email/Mật khẩu.';
      setAuthMessage(msg);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRotateKey = async () => {
    const nextFp = await rotateDeviceAesKey();
    setKeyFingerprint(nextFp);
    onLogSecurityAction('Xoay vòng khóa AES-256-GCM', `Fingerprint mới: ${nextFp}`);
    setAuthMessage(`Đã tạo khóa thiết bị mới (${nextFp}).`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-security-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-[#0D0F14]">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2
              id="profile-security-title"
              className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
            >
              Hồ sơ Cá nhân hóa, Tài khoản & Bảo mật
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cấu hình chỉ số cơ thể, ngôn ngữ mục tiêu, đồng bộ Firestore và quyền riêng tư.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ hồ sơ"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex gap-2 border-b border-slate-200 px-6 py-2.5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === 'profile'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Sliders className="h-3.5 w-3.5" />
            <span>Cá nhân hóa</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('account')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === 'account'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Cloud className="h-3.5 w-3.5" />
            <span>Tài khoản & Cloud</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('security')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${
              tab === 'security'
                ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <Shield className="h-3.5 w-3.5" />
            <span>Quyền & Nhật ký Bảo mật</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {tab === 'profile' && (
            <div className="space-y-5">
              <div className="grid gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 sm:grid-cols-4 dark:border-zinc-800 dark:bg-[#13151C]">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">BMI</div>
                  <div className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {bmi.bmi}
                  </div>
                  <div className="text-[11px] text-orange-600 dark:text-[#FF6B1A]">{bmi.category}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">BMR</div>
                  <div className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {bmr} kcal
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">TDEE</div>
                  <div className="font-mono text-lg font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {tdee} kcal
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Mục tiêu/ngày</div>
                  <div className="font-mono text-lg font-bold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                    {targetCalories} kcal
                  </div>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tên hiển thị
                  <input
                    type="text"
                    value={state.profile.displayName}
                    onChange={(e) => onUpdateProfile({ displayName: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Tuổi
                  <input
                    type="number"
                    min={10}
                    max={110}
                    value={state.profile.age}
                    onChange={(e) => onUpdateProfile({ age: Number(e.target.value) || 25 })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Giới tính sinh học (tính BMR)
                  <select
                    value={state.profile.sex}
                    onChange={(e) => onUpdateProfile({ sex: e.target.value as BiologicalSex })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="female">Nữ</option>
                    <option value="male">Nam</option>
                    <option value="other">Khác</option>
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Mức độ vận động
                  <select
                    value={state.profile.activityLevel}
                    onChange={(e) =>
                      onUpdateProfile({ activityLevel: e.target.value as ActivityLevel })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="sedentary">Ít vận động</option>
                    <option value="light">Nhẹ (1-3 buổi/tuần)</option>
                    <option value="moderate">Trung bình (3-5 buổi/tuần)</option>
                    <option value="active">Năng động (6-7 buổi/tuần)</option>
                    <option value="athlete">Cường độ cao</option>
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Chiều cao (cm)
                  <input
                    type="number"
                    min={100}
                    max={230}
                    value={state.profile.heightCm}
                    onChange={(e) => onUpdateProfile({ heightCm: Number(e.target.value) || 165 })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Cân nặng (kg)
                  <input
                    type="number"
                    min={30}
                    max={250}
                    value={state.profile.weightKg}
                    onChange={(e) => onUpdateProfile({ weightKg: Number(e.target.value) || 60 })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Mục tiêu thể chất
                  <select
                    value={state.profile.goal}
                    onChange={(e) => onUpdateProfile({ goal: e.target.value as FitnessGoal })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="lose_fat">Giảm mỡ an toàn (-400 kcal)</option>
                    <option value="maintain">Duy trì cân bằng</option>
                    <option value="build_muscle">Tăng cơ (+280 kcal)</option>
                    <option value="endurance">Tăng sức bền (+150 kcal)</option>
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Chế độ ăn ưu tiên
                  <input
                    type="text"
                    value={state.profile.dietaryPreference}
                    onChange={(e) => onUpdateProfile({ dietaryPreference: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Ngôn ngữ đang học
                  <select
                    value={state.profile.targetLanguageCode}
                    onChange={(e) => onUpdateProfile({ targetLanguageCode: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {GLOBAL_LANGUAGES.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.nameVi} ({l.nativeName})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Trình độ & Giới tính Giọng AI (Nam / Nữ)
                  <div className="mt-1 grid grid-cols-12 gap-2">
                    <select
                      value={state.profile.languageLevel}
                      onChange={(e) => onUpdateProfile({ languageLevel: e.target.value as CefrLevel })}
                      className="col-span-3 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as CefrLevel[]).map((lv) => (
                        <option key={lv} value={lv}>
                          {lv}
                        </option>
                      ))}
                    </select>
                    <select
                      value={state.profile.aiVoiceGender || 'female'}
                      onChange={(e) =>
                        onUpdateProfile({
                          aiVoiceGender: e.target.value as 'female' | 'male',
                          aiVoiceName: e.target.value === 'male' ? 'Charon' : 'Kore',
                        })
                      }
                      className="col-span-4 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="female">Nữ AI</option>
                      <option value="male">Nam AI</option>
                    </select>
                    <select
                      value={state.profile.vietnameseRegion || 'north'}
                      onChange={(e) =>
                        onUpdateProfile({
                          vietnameseRegion: e.target.value as 'north' | 'south',
                        })
                      }
                      className="col-span-5 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs sm:text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    >
                      <option value="north">Miền Bắc</option>
                      <option value="south">Miền Nam</option>
                    </select>
                  </div>
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Mục tiêu nước (ml) & Vận động (phút)
                  <div className="mt-1 flex gap-2">
                    <input
                      type="number"
                      min={500}
                      max={6000}
                      step={100}
                      value={state.profile.dailyWaterGoalMl}
                      onChange={(e) =>
                        onUpdateProfile({ dailyWaterGoalMl: Number(e.target.value) || 2000 })
                      }
                      className="w-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <input
                      type="number"
                      min={10}
                      max={180}
                      step={5}
                      value={state.profile.dailyWorkoutMinutes}
                      onChange={(e) =>
                        onUpdateProfile({ dailyWorkoutMinutes: Number(e.target.value) || 30 })
                      }
                      className="w-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                  </div>
                </label>

                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Dị ứng thực phẩm (cách nhau dấu phẩy)
                  <input
                    type="text"
                    value={state.profile.allergies.join(', ')}
                    onChange={(e) =>
                      onUpdateProfile({
                        allergies: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </label>
              </div>

              {/* Vietnamese Crystal-Clear AI Voice & Reference Storytelling Sample */}
              <div className="rounded-lg border border-orange-500/30 bg-orange-950/10 p-4 dark:bg-[#13151C]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-orange-600 dark:text-[#FF6B1A]">
                      Kiểm tra độ rõ Giọng AI Tiếng Việt (Chuẩn truyền cảm)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Chuẩn hóa ngắt nghỉ dấu câu, phát âm 6 thanh điệu và so sánh với mẫu video &quot;Chú Gà Con Tập Bay&quot;.
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void speakWithAiVoice({
                          text: 'Xin chào các bạn nhỏ đáng yêu. Hôm nay hãy hít sâu bằng mũi 4 giây, giữ vững tư thế thẳng lưng và luyện tập thật vui vẻ nhé.',
                          languageCode: 'vi',
                          bcp47: 'vi-VN',
                          gender: 'female',
                          vietnameseRegion: state.profile.vietnameseRegion || 'north',
                          styleContext: 'language',
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-pink-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-pink-500"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>Thử Nữ Tiếng Việt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void speakWithAiVoice({
                          text: 'Chào bạn! Mình là huấn luyện viên Quốc Minh. Hãy giữ nhịp thở đều và bắt đầu bài tập ngay bây giờ.',
                          languageCode: 'vi',
                          bcp47: 'vi-VN',
                          gender: 'male',
                          vietnameseRegion: state.profile.vietnameseRegion || 'north',
                          styleContext: 'fitness',
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>Thử Nam Tiếng Việt</span>
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <video
                    controls
                    preload="metadata"
                    playsInline
                    src="/assets/aistudio/chu_ga_con_tap_bay_2c1d5069.mp4"
                    className="h-28 w-44 shrink-0 rounded-lg border border-slate-700 bg-slate-950 object-cover"
                  />
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    Video mẫu tham chiếu: <span className="font-semibold">Chú Gà Con Tập Bay</span> — nhịp đọc chậm vừa phải, tách chữ rõ ràng và ngữ điệu tự nhiên để bạn đối chiếu trực tiếp với giọng đọc AI của ứng dụng.
                  </p>
                </div>
              </div>
            </div>
          )}

          {tab === 'account' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-zinc-800 dark:bg-[#13151C]">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Trạng thái Cloud Firestore</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {dbStatus === 'connected'
                      ? 'Đã kết nối Firebase Firestore'
                      : dbStatus === 'checking'
                        ? 'Đang kiểm tra kết nối...'
                        : dbStatus === 'offline'
                          ? 'Đang ngoại tuyến (lưu cục bộ)'
                          : 'Chưa kết nối máy chủ dữ liệu'}
                  </div>
                </div>
                {authUser && (
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-orange-600 dark:text-[#FF6B1A]" />
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {authUser.displayName} ({authUser.email || authUser.provider})
                    </span>
                  </div>
                )}
              </div>

              {authUser ? (
                <div className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Dữ liệu đồng bộ lên Firestore được mã hóa AES-256-GCM trước khi rời thiết bị của bạn.
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => void onSyncCloudNow()}
                      className="rounded-lg bg-orange-600 px-4 py-2 text-xs font-medium text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
                    >
                      Đẩy dữ liệu lên Cloud ngay
                    </button>
                    <button
                      type="button"
                      onClick={() => void onPullCloudNow()}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Tải dữ liệu từ Cloud về máy
                    </button>
                    <button
                      type="button"
                      onClick={() => void signOutFirebaseSession()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-4 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950/50"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={() => void handleGoogleSignIn()}
                    className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-[#FF6B1A] dark:text-zinc-950"
                  >
                    Đăng nhập nhanh bằng Google
                  </button>

                  <form
                    onSubmit={handleEmailAuth}
                    className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {authMode === 'login' ? 'Đăng nhập bằng Email' : 'Tạo tài khoản Email mới'}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setAuthMode((m) => (m === 'login' ? 'register' : 'login'))
                        }
                        className="text-xs font-medium text-orange-600 hover:underline dark:text-[#FF6B1A]"
                      >
                        {authMode === 'login' ? 'Chưa có tài khoản? Đăng ký' : 'Đã có tài khoản? Đăng nhập'}
                      </button>
                    </div>

                    {authMode === 'register' && (
                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="Tên hiển thị"
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    )}
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="Email"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <input
                      type="password"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      placeholder="Mật khẩu (>= 6 ký tự)"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={authBusy}
                      className="w-full rounded-lg border border-slate-300 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      {authMode === 'login' ? 'Đăng nhập Email' : 'Đăng ký tài khoản'}
                    </button>
                  </form>
                </div>
              )}

              {authMessage && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-900 dark:border-orange-900 dark:bg-orange-950/35 dark:text-orange-200">
                  {authMessage}
                </div>
              )}
            </div>
          )}

          {tab === 'security' && (
            <div className="space-y-5">
              {/* Permissions */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Kiểm soát Quyền truy cập (Tùy chọn của bạn)
                </h3>
                {(
                  [
                    ['camera', 'Camera (Phân tích tư thế tập luyện & chụp ảnh món ăn)'],
                    ['microphone', 'Microphone (Trợ lý giọng nói hai chiều & luyện nói)'],
                    ['healthData', 'Lưu chỉ số sức khỏe, cân nặng, giấc ngủ cục bộ'],
                    ['allowAiPersonalData', 'Cho phép gửi tóm tắt sức khỏe khi hỏi Trợ lý AI'],
                    ['notifications', 'Thông báo nhắc uống nước, vận động & giờ ngủ'],
                  ] as Array<[keyof UserPermissions, string]>
                ).map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {label}
                    </span>
                    <input
                      type="checkbox"
                      checked={state.permissions[key]}
                      onChange={(e) => onUpdatePermissions({ [key]: e.target.checked })}
                      className="h-4 w-4 accent-orange-600 dark:accent-[#FF6B1A]"
                    />
                  </label>
                ))}
              </div>

              {/* Encryption & Data Sovereignty */}
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 dark:border-zinc-800 dark:bg-[#13151C]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Khóa mã hóa AES-256-GCM trên thiết bị
                    </div>
                    <div className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      Fingerprint: {keyFingerprint}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRotateKey()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    <span>Xoay vòng khóa</span>
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button
                    type="button"
                    onClick={onExportJson}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Xuất toàn bộ dữ liệu (JSON)</span>
                  </button>

                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa toàn bộ dữ liệu</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDelete(false);
                          void onDeleteAllData();
                        }}
                        className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-500"
                      >
                        Xác nhận xóa vĩnh viễn
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300"
                      >
                        Hủy
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Access Audit Log */}
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Nhật ký truy cập & bảo mật ({state.auditLog.length})
                </h3>
                <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  {state.auditLog.map((log) => (
                    <div
                      key={log.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-1.5 text-xs last:border-0 dark:border-slate-800/70"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        [{log.module}] {log.action} ·{' '}
                        <span className="font-normal text-slate-500 dark:text-slate-400">
                          {log.detail}
                        </span>
                      </span>
                      <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString('vi-VN')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
