import React, { useState } from 'react';
import {
  AlertCircle,
  Barcode,
  Camera,
  Droplets,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { FOOD_CATEGORY_META, FOOD_LIBRARY } from '../data/foods';
import type {
  FoodCatalogItem,
  FoodCategoryId,
  MealLogEntry,
  UserPersonalProfile,
} from '../types/lifeworld';
import {
  calculateMacroTargets,
  calculateTdeeAndTarget,
  computeBmi,
  computeFoodPortionNutrients,
  sumDailyNutrition,
} from '../utils/healthEngine';

interface NutritionAndFoodViewProps {
  profile: UserPersonalProfile;
  meals: MealLogEntry[];
  waterMlToday: number;
  workoutCaloriesBurned: number;
  onAddWater: (ml: number) => void;
  onAddMeal: (meal: Omit<MealLogEntry, 'id' | 'loggedAt'>) => void;
  onDeleteMeal: (id: string) => void;
}

export const NutritionAndFoodView: React.FC<NutritionAndFoodViewProps> = ({
  profile,
  meals,
  waterMlToday,
  workoutCaloriesBurned,
  onAddWater,
  onAddMeal,
  onDeleteMeal,
}) => {
  const [activeTab, setActiveTab] = useState<'tracker' | 'library'>('tracker');

  // Food Library filters
  const [selectedCategory, setSelectedCategory] = useState<'all' | FoodCategoryId>('all');
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState<FoodCatalogItem>(FOOD_LIBRARY[0]);
  const [customGrams, setCustomGrams] = useState<number>(FOOD_LIBRARY[0].servingGrams);
  const [mealSlot, setMealSlot] = useState<MealLogEntry['mealSlot']>('lunch');

  // Manual & AI Food / Barcode inputs
  const [manualQuery, setManualQuery] = useState('');
  const [manualGrams, setManualGrams] = useState(250);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysisResult, setAiAnalysisResult] = useState<{
    dishName: string;
    category: string;
    estimatedGrams: number;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
    confidenceLevel: string;
    confidenceExplanation: string;
    allergens: string[];
    healthyPairingSuggestion: string;
  } | null>(null);

  const [weeklyPlanGoal, setWeeklyPlanGoal] = useState<'balanced' | 'high_protein' | 'plant_rich'>('balanced');

  const { bmr, tdee, targetCalories } = calculateTdeeAndTarget(profile);
  const macroTargets = calculateMacroTargets(targetCalories, profile.goal, profile.weightKg);
  const { bmi, category: bmiCategory } = computeBmi(profile.weightKg, profile.heightCm);
  const totals = sumDailyNutrition(meals);

  const filteredFoods = FOOD_LIBRARY.filter((item) => {
    const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
    const q = foodSearch.trim().toLowerCase();
    const matchesSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.nameEn.toLowerCase().includes(q) ||
      FOOD_CATEGORY_META[item.category].label.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const handleSelectFood = (item: FoodCatalogItem) => {
    setSelectedFood(item);
    setCustomGrams(item.servingGrams);
  };

  const handleLogLibraryFood = () => {
    const portion = computeFoodPortionNutrients(selectedFood, customGrams);
    onAddMeal({
      name: `${selectedFood.name} (${customGrams}g)`,
      mealSlot,
      grams: customGrams,
      calories: portion.calories,
      proteinG: portion.proteinG,
      carbsG: portion.carbsG,
      fatG: portion.fatG,
      fiberG: portion.fiberG,
      sugarG: portion.sugarG,
      sodiumMg: portion.sodiumMg,
      sourceType: 'library',
      confidenceNote: selectedFood.sourceNote,
    });
  };

  const handleAnalyzeWithAi = async (file?: File) => {
    setAiLoading(true);
    setAiStatusMessage(null);
    setAiAnalysisResult(null);

    try {
      let imageBase64: string | undefined;
      let imageMimeType: string | undefined;
      if (file) {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Không đọc được ảnh'));
          reader.readAsDataURL(file);
        });
        imageBase64 = dataUrl.split(',')[1];
        imageMimeType = file.type || 'image/jpeg';
      }

      const resp = await fetch('/api/nutrition/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foodQuery: manualQuery,
          grams: manualGrams,
          imageBase64,
          imageMimeType,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setAiStatusMessage(data.error || 'Chưa thể phân tích món ăn bằng AI.');
      } else {
        setAiAnalysisResult(data);
      }
    } catch {
      setAiStatusMessage('Lỗi kết nối tới dịch vụ phân tích dinh dưỡng.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleLookupBarcode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    setAiLoading(true);
    setAiStatusMessage(null);
    try {
      const resp = await fetch(`/api/nutrition/barcode/${encodeURIComponent(barcodeInput.trim())}`);
      const data = await resp.json();
      if (!resp.ok) {
        setAiStatusMessage(data.error || 'Không tìm thấy mã vạch.');
      } else {
        const factor = manualGrams / 100;
        onAddMeal({
          name: `${data.name} (${data.brand})`,
          mealSlot,
          grams: manualGrams,
          calories: Math.round(data.caloriesPer100g * factor),
          proteinG: Number((data.proteinPer100g * factor).toFixed(1)),
          carbsG: Number((data.carbsPer100g * factor).toFixed(1)),
          fatG: Number((data.fatPer100g * factor).toFixed(1)),
          fiberG: Number((data.fiberPer100g * factor).toFixed(1)),
          sugarG: Number((data.sugarPer100g * factor).toFixed(1)),
          sodiumMg: Math.round(data.sodiumMgPer100g * factor),
          sourceType: 'barcode',
          confidenceNote: data.source,
        });
        setAiStatusMessage(`Đã thêm "${data.name}" từ cơ sở dữ liệu OpenFoodFacts thực.`);
        setBarcodeInput('');
      }
    } catch {
      setAiStatusMessage('Lỗi kết nối cơ sở dữ liệu mã vạch.');
    } finally {
      setAiLoading(false);
    }
  };

  const weeklyMenus: Record<
    'balanced' | 'high_protein' | 'plant_rich',
    Array<{ day: string; meals: string }>
  > = {
    balanced: [
      { day: 'Thứ 2', meals: 'Yến mạch sữa chua Hy Lạp · Cơm gạo lứt ức gà · Cá hồi áp chảo & bông cải' },
      { day: 'Thứ 3', meals: 'Trứng luộc & bơ bánh mì đen · Phở gà ít béo · Đậu hũ hấp nấm & rau xanh' },
      { day: 'Thứ 4', meals: 'Sinh tố chuối whey · Cá thu kho & cơm lứt · Salad ức gà hạt hạnh nhân' },
      { day: 'Thứ 5', meals: 'Khoai lang & trứng ốp · Bún thịt nạc nhiều rau · Đậu nành edamame & cá hồi' },
      { day: 'Thứ 6', meals: 'Sữa chua Hy Lạp việt quất · Cơm lứt thịt bò xào · Canh rau củ & đậu hũ' },
      { day: 'Thứ 7', meals: 'Bánh mì nguyên cám & bơ · Cá hấp gừng & rau · Sô-cô-la đen 75% (20g) & trà xanh' },
      { day: 'Chủ nhật', meals: 'Yến mạch hạt chia · Bữa gia đình cân bằng rau 50% đĩa · Súp bí đỏ nhẹ buổi tối' },
    ],
    high_protein: [
      { day: 'Thứ 2', meals: '3 trứng luộc & yến mạch · 200g ức gà & gạo lứt · 150g cá hồi & măng tây' },
      { day: 'Thứ 3', meals: 'Whey Isolate & chuối · Thịt nạc thăn xào rau · Sữa chua Hy Lạp & hạnh nhân' },
      { day: 'Thứ 4', meals: 'Trứng chần & bánh mì đen · Tôm hấp & diêm mạch · Đậu hũ áp chảo & bông cải' },
      { day: 'Thứ 5', meals: 'Sữa chua Hy Lạp 200g · Ức gà nướng thảo mộc · Cá ngừ salad bơ' },
      { day: 'Thứ 6', meals: '2 trứng + 100g ức gà · Bò áp chảo & khoai lang · Đậu edamame & canh rong biển' },
      { day: 'Thứ 7', meals: 'Whey yến mạch · Cá hồi nướng & rau · Phô mai tươi / sữa chua không đường' },
      { day: 'Chủ nhật', meals: 'Trứng ốp & bơ · Gà luộc xé phay & cơm lứt · Súp gà nấm nhẹ nhàng' },
    ],
    plant_rich: [
      { day: 'Thứ 2', meals: 'Yến mạch sữa đậu nành · Đậu hũ sốt cà & cơm lứt · Salad bơ, edamame & hạt óc chó' },
      { day: 'Thứ 3', meals: 'Bánh mì nguyên cám & bơ · Bún nấm rau củ · Đậu lăng hầm bí đỏ' },
      { day: 'Thứ 4', meals: 'Sữa chua hạt chia · Cơm lứt đậu gà & bông cải · Canh rong biển đậu phụ' },
      { day: 'Thứ 5', meals: 'Khoai lang & hạnh nhân · Mì soba rau củ & nấm · Sinh tố xanh & hạt lanh' },
      { day: 'Thứ 6', meals: 'Cháo yến mạch nấm · Đậu hũ nướng sả & rau · Bơ tươi & hạt bí' },
      { day: 'Thứ 7', meals: 'Trái cây & ngũ cốc nguyên hạt · Lẩu nấm rau xanh · Sô-cô-la đen 75% & trà xanh' },
      { day: 'Chủ nhật', meals: 'Bánh mì bơ đậu phộng · Cơm trộn Hàn Quốc chay · Đậu nành edamame hấp' },
    ],
  };

  const selectedPortion = computeFoodPortionNutrients(selectedFood, customGrams);

  return (
    <div className="space-y-6">
      {/* Header Banner + Tab Switcher */}
      <section className="grid grid-cols-1 overflow-hidden rounded-xl border border-stone-200/90 bg-white/95 lg:grid-cols-12 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
        <div className="p-6 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">
                BMR {bmr} kcal · TDEE {tdee} kcal · BMI {bmi} ({bmiCategory})
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold text-slate-900 dark:text-slate-100">
                Dinh dưỡng Thông minh & Thư viện 15 Nhóm Thực phẩm
              </h1>
            </div>
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('tracker')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'tracker'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Quản lý Calo & AI Scan
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('library')}
                className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === 'library'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Phân loại Thực phẩm (15 nhóm)
              </button>
            </div>
          </div>

          {/* Macro Progress Bars */}
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Calo nạp / Mục tiêu</div>
              <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {totals.calories} / {targetCalories}
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">Tiêu hao tập: {workoutCaloriesBurned} kcal</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Đạm (Protein)</div>
              <div className="mt-1 font-mono text-base font-bold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                {totals.proteinG}g / {macroTargets.proteinG}g
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">Xơ: {totals.fiberG}g / {macroTargets.fiberG}g</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Tinh bột & Chất béo</div>
              <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                {totals.carbsG}g C · {totals.fatG}g F
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                Đường: {totals.sugarG}g · Natri: {totals.sodiumMg}mg
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Nước uống</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-base font-bold text-sky-700 tabular-nums dark:text-sky-400">
                  {waterMlToday}ml
                </span>
                <button
                  type="button"
                  onClick={() => onAddWater(250)}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-200 px-2 py-0.5 text-[11px] font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-300"
                >
                  <Droplets className="h-3 w-3" />
                  +250ml
                </button>
              </div>
              <div className="text-[11px] text-slate-500 tabular-nums">
                Mục tiêu: {profile.dailyWaterGoalMl}ml · Khuyến nghị {macroTargets.recommendedWaterMl}ml
              </div>
            </div>
          </div>
        </div>
        <div className="relative min-h-[180px] lg:col-span-4">
          <img
            src="/src/assets/images/nutrition_fresh_bowls_1794713385166.jpg"
            alt="Healthy Balanced Meals"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover"
          />
        </div>
      </section>

      {activeTab === 'tracker' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: AI Food Recognition + Barcode + Manual Entry */}
          <section className="space-y-6 lg:col-span-6">
            <div className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                Nhận diện Món ăn AI & Quét Mã vạch
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Nhập tên món/thành phần, tải ảnh bữa ăn để AI ước tính (nêu rõ mức độ tin cậy), hoặc nhập mã vạch thực phẩm chuẩn quốc tế.
              </p>

              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={mealSlot}
                    onChange={(e) => setMealSlot(e.target.value as MealLogEntry['mealSlot'])}
                    aria-label="Chọn bữa ăn"
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="breakfast">Bữa sáng</option>
                    <option value="lunch">Bữa trưa</option>
                    <option value="dinner">Bữa tối</option>
                    <option value="snack">Bữa phụ</option>
                  </select>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
                    <span className="text-slate-500">Khối lượng (g):</span>
                    <input
                      type="number"
                      min={10}
                      max={2000}
                      value={manualGrams}
                      onChange={(e) => setManualGrams(Number(e.target.value) || 200)}
                      className="w-full bg-transparent font-mono font-semibold text-slate-900 outline-none dark:text-slate-100"
                    />
                  </label>
                </div>

                <input
                  type="text"
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  placeholder="Ví dụ: 1 tô bún bò Huế ít mỡ hoặc 150g cá hồi + 120g cơm..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={aiLoading}
                    onClick={() => handleAnalyzeWithAi()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-600 px-4 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60 dark:bg-[#FF6B1A] dark:text-zinc-950"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>{aiLoading ? 'Đang phân tích...' : 'Phân tích AI'}</span>
                  </button>

                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    <Camera className="h-3.5 w-3.5" />
                    <span>Chụp / Tải ảnh món ăn</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleAnalyzeWithAi(f);
                      }}
                    />
                  </label>
                </div>

                <form onSubmit={handleLookupBarcode} className="flex gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
                  <div className="relative flex-1">
                    <Barcode className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      placeholder="Nhập mã vạch (VD: 3017620422003)..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 font-mono text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={aiLoading}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900"
                  >
                    Tra mã vạch
                  </button>
                </form>

                {aiStatusMessage && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>{aiStatusMessage}</span>
                  </div>
                )}

                {aiAnalysisResult && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-4 text-xs dark:border-orange-900 dark:bg-orange-950/30">
                    <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                      <span>{aiAnalysisResult.dishName}</span>
                      <span className="font-mono text-orange-600 dark:text-[#FF6B1A]">
                        {aiAnalysisResult.calories} kcal ({aiAnalysisResult.estimatedGrams}g)
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 tabular-nums dark:text-slate-300">
                      Đạm {aiAnalysisResult.proteinG}g · Tinh bột {aiAnalysisResult.carbsG}g · Béo {aiAnalysisResult.fatG}g · Xơ {aiAnalysisResult.fiberG}g · Natri {aiAnalysisResult.sodiumMg}mg
                    </p>
                    <p className="mt-1.5 text-slate-700 dark:text-slate-300">
                      Độ tin cậy: <strong>{aiAnalysisResult.confidenceLevel}</strong> — {aiAnalysisResult.confidenceExplanation}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onAddMeal({
                          name: aiAnalysisResult.dishName,
                          mealSlot,
                          grams: aiAnalysisResult.estimatedGrams,
                          calories: aiAnalysisResult.calories,
                          proteinG: aiAnalysisResult.proteinG,
                          carbsG: aiAnalysisResult.carbsG,
                          fatG: aiAnalysisResult.fatG,
                          fiberG: aiAnalysisResult.fiberG,
                          sugarG: aiAnalysisResult.sugarG,
                          sodiumMg: aiAnalysisResult.sodiumMg,
                          sourceType: 'ai_photo',
                          confidenceNote: aiAnalysisResult.confidenceLevel,
                        });
                        setAiAnalysisResult(null);
                      }}
                      className="mt-3 inline-flex items-center gap-1 rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Lưu vào Nhật ký Ăn uống</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Weekly Meal Plan Generator */}
            <div className="rounded-xl border border-stone-200/90 bg-white/95 p-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  Thực đơn Gợi ý Theo Tuần
                </h2>
                <select
                  value={weeklyPlanGoal}
                  onChange={(e) => setWeeklyPlanGoal(e.target.value as typeof weeklyPlanGoal)}
                  aria-label="Mục tiêu thực đơn tuần"
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="balanced">Cân bằng Toàn diện</option>
                  <option value="high_protein">Giàu Đạm Tăng cơ</option>
                  <option value="plant_rich">Ưu tiên Thực vật</option>
                </select>
              </div>
              <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                {weeklyMenus[weeklyPlanGoal].map((row) => (
                  <div key={row.day} className="py-2 text-xs">
                    <span className="font-semibold text-orange-600 dark:text-[#FF6B1A]">{row.day}: </span>
                    <span className="text-slate-700 dark:text-slate-300">{row.meals}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Right: Daily Meal Log */}
          <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-6 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              Nhật ký Bữa ăn Hôm nay ({meals.length} món)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Theo dõi calo, macro, chất xơ, đường và natri theo từng khẩu phần.
            </p>

            {meals.length === 0 ? (
              <div className="mt-6 rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700">
                Chưa có món ăn nào hôm nay. Hãy thêm từ Thư viện Thực phẩm hoặc AI Scan.
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                {meals.map((meal) => (
                  <div key={meal.id} className="flex items-start justify-between gap-3 py-3.5">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {meal.name}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                        {meal.mealSlot === 'breakfast'
                          ? 'Sáng'
                          : meal.mealSlot === 'lunch'
                            ? 'Trưa'
                            : meal.mealSlot === 'dinner'
                              ? 'Tối'
                              : 'Phụ'}{' '}
                        · {meal.grams}g · P {meal.proteinG}g · C {meal.carbsG}g · F {meal.fatG}g · Natri {meal.sodiumMg}mg
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="font-mono text-sm font-bold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                        {meal.calories} kcal
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteMeal(meal.id)}
                        aria-label={`Xóa món ${meal.name}`}
                        className="p-1 text-slate-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        /* 15-Category Food Classification Library */
        <div className="space-y-6">
          <div className="rounded-xl border border-stone-200/90 bg-white/95 p-4 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  placeholder="Tìm kiếm thực phẩm (cá hồi, bông cải, đậu hũ, whey...)"
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                  selectedCategory === 'all'
                    ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                    : 'border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                Tất cả 15 nhóm
              </button>
              {(Object.keys(FOOD_CATEGORY_META) as FoodCategoryId[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-orange-600 text-white dark:bg-[#FF6B1A] dark:text-zinc-950'
                      : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {FOOD_CATEGORY_META[cat].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-2.5 lg:col-span-5">
              {filteredFoods.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => handleSelectFood(food)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${
                    selectedFood.id === food.id
                      ? 'border-orange-500 bg-orange-50/50 dark:border-[#FF6B1A] dark:bg-orange-950/30'
                      : 'border-stone-200/90 bg-white/95 hover:border-stone-300 dark:border-zinc-800/90 dark:bg-[#13151C]/95'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-display text-sm font-bold text-slate-900 dark:text-slate-100">
                      {food.name}
                    </span>
                    <span className="font-mono text-xs font-semibold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                      {food.caloriesPer100g} kcal/100g
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {FOOD_CATEGORY_META[food.category].label} · {food.processingLevel} · Khẩu phần {food.servingLabel}
                  </div>
                </button>
              ))}
            </div>

            <section className="rounded-xl border border-stone-200/90 bg-white/95 p-6 lg:col-span-7 dark:border-zinc-800/90 dark:bg-[#13151C]/95">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-orange-600 dark:text-[#FF6B1A]">
                    {FOOD_CATEGORY_META[selectedFood.category].label} · {selectedFood.processingLevel}
                  </p>
                  <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-slate-100">
                    {selectedFood.name}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{selectedFood.sourceNote}</p>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={10}
                    max={1500}
                    value={customGrams}
                    onChange={(e) => setCustomGrams(Number(e.target.value) || 100)}
                    aria-label="Khẩu phần gam"
                    className="w-20 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="text-xs text-slate-500">g</span>
                  <button
                    type="button"
                    onClick={handleLogLibraryFood}
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-orange-700 dark:bg-[#FF6B1A] dark:text-zinc-950"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Thêm vào bữa ăn</span>
                  </button>
                </div>
              </div>

              {/* Nutrient Comparison: Per 100g vs Selected Serving */}
              <div className="mt-5 grid grid-cols-2 gap-3 rounded-lg border border-stone-200 bg-stone-50 p-4 text-xs sm:grid-cols-4 dark:border-zinc-800 dark:bg-[#0D0F14]">
                <div>
                  <div className="text-slate-500">Năng lượng ({customGrams}g)</div>
                  <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {selectedPortion.calories} kcal
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">100g: {selectedFood.caloriesPer100g}</div>
                </div>
                <div>
                  <div className="text-slate-500">Protein / Chất béo</div>
                  <div className="mt-1 font-mono text-base font-bold text-orange-600 tabular-nums dark:text-[#FF6B1A]">
                    {selectedPortion.proteinG}g / {selectedPortion.fatG}g
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    100g: {selectedFood.proteinPer100g}g / {selectedFood.fatPer100g}g
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Tinh bột / Chất xơ</div>
                  <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {selectedPortion.carbsG}g / {selectedPortion.fiberG}g
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    Đường: {selectedPortion.sugarG}g
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Natri</div>
                  <div className="mt-1 font-mono text-base font-bold text-slate-900 tabular-nums dark:text-slate-100">
                    {selectedPortion.sodiumMg} mg
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">100g: {selectedFood.sodiumMgPer100g}mg</div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Vitamin & Khoáng chất chính</h3>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {selectedFood.vitaminsMinerals.join(' · ')}
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Dị ứng cần lưu ý</h3>
                  <p className="mt-1 text-rose-700 dark:text-rose-400">{selectedFood.allergens.join(' · ')}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Lợi ích dinh dưỡng có căn cứ</h3>
                  <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">{selectedFood.benefits}</p>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Bảo quản & Hạn dùng an toàn</h3>
                  <p className="mt-1 leading-relaxed text-slate-600 dark:text-slate-300">
                    {selectedFood.storageGuide} ({selectedFood.shelfLife})
                  </p>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                <span className="font-semibold text-slate-900 dark:text-slate-100">Gợi ý kết hợp: </span>
                {selectedFood.pairings.join(' · ')}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
