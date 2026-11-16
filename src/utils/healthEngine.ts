import type {
  ActivityLevel,
  FitnessGoal,
  FoodCatalogItem,
  MealLogEntry,
  UserPersonalProfile,
} from '../types/lifeworld';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

const GOAL_CALORIE_DELTAS: Record<FitnessGoal, number> = {
  lose_fat: -400,
  maintain: 0,
  build_muscle: 300,
  endurance: 150,
};

/**
 * Mifflin-St Jeor equation (1990) for Basal Metabolic Rate in kcal/day.
 */
export function calculateBmrMifflinStJeor(
  profile: Pick<UserPersonalProfile, 'weightKg' | 'heightCm' | 'age' | 'sex'>
): number {
  const weight = Math.max(25, Math.min(300, Number(profile.weightKg) || 65));
  const height = Math.max(100, Math.min(240, Number(profile.heightCm) || 170));
  const age = Math.max(10, Math.min(110, Number(profile.age) || 28));

  const base = 10 * weight + 6.25 * height - 5 * age;
  if (profile.sex === 'male') return Math.round(base + 5);
  if (profile.sex === 'female') return Math.round(base - 161);
  return Math.round(base - 78);
}

export function calculateTdeeAndTarget(
  profile: Pick<UserPersonalProfile, 'weightKg' | 'heightCm' | 'age' | 'sex' | 'activityLevel' | 'goal'>
): { bmr: number; tdee: number; targetCalories: number } {
  const bmr = calculateBmrMifflinStJeor(profile);
  const multiplier = ACTIVITY_MULTIPLIERS[profile.activityLevel] ?? 1.55;
  const tdee = Math.round(bmr * multiplier);
  const delta = GOAL_CALORIE_DELTAS[profile.goal] ?? 0;
  const minSafeCalories = profile.sex === 'female' ? 1200 : 1400;
  const targetCalories = Math.max(minSafeCalories, tdee + delta);
  return { bmr, tdee, targetCalories };
}

export function calculateMacroTargets(
  targetCalories: number,
  goal: FitnessGoal,
  weightKg: number
): {
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
  recommendedWaterMl: number;
} {
  const safeWeight = Math.max(35, weightKg || 65);
  const proteinPerKg = goal === 'build_muscle' ? 1.8 : goal === 'lose_fat' ? 1.7 : 1.4;
  const proteinG = Math.round(safeWeight * proteinPerKg);
  const fatCalories = Math.round(targetCalories * 0.27);
  const fatG = Math.round(fatCalories / 9);
  const remainingCalories = Math.max(200, targetCalories - proteinG * 4 - fatG * 9);
  const carbsG = Math.round(remainingCalories / 4);
  const fiberG = Math.round((targetCalories / 1000) * 14);
  const recommendedWaterMl = Math.round(safeWeight * 35);

  return { proteinG, carbsG, fatG, fiberG, recommendedWaterMl };
}

export function computeFoodPortionNutrients(food: FoodCatalogItem, grams: number) {
  const factor = Math.max(1, grams) / 100;
  return {
    calories: Math.round(food.caloriesPer100g * factor),
    proteinG: Number((food.proteinPer100g * factor).toFixed(1)),
    carbsG: Number((food.carbsPer100g * factor).toFixed(1)),
    fatG: Number((food.fatPer100g * factor).toFixed(1)),
    fiberG: Number((food.fiberPer100g * factor).toFixed(1)),
    sugarG: Number((food.sugarPer100g * factor).toFixed(1)),
    sodiumMg: Math.round(food.sodiumMgPer100g * factor),
  };
}

export function sumDailyNutrition(meals: MealLogEntry[]) {
  return meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + Math.round(meal.calories || 0),
      proteinG: Number((acc.proteinG + (meal.proteinG || 0)).toFixed(1)),
      carbsG: Number((acc.carbsG + (meal.carbsG || 0)).toFixed(1)),
      fatG: Number((acc.fatG + (meal.fatG || 0)).toFixed(1)),
      fiberG: Number((acc.fiberG + (meal.fiberG || 0)).toFixed(1)),
      sugarG: Number((acc.sugarG + (meal.sugarG || 0)).toFixed(1)),
      sodiumMg: acc.sodiumMg + Math.round(meal.sodiumMg || 0),
    }),
    {
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      sodiumMg: 0,
    }
  );
}

/**
 * Compendium of Physical Activities formula:
 * kcal = MET * weight(kg) * duration(hours)
 */
export function calculateWorkoutCalories(
  met: number,
  weightKg: number,
  durationMinutes: number
): number {
  const safeMet = Math.max(1, met || 3.5);
  const safeWeight = Math.max(30, weightKg || 65);
  const safeHours = Math.max(0.05, durationMinutes / 60);
  return Math.round(safeMet * safeWeight * safeHours);
}

export function computeBmi(weightKg: number, heightCm: number): { bmi: number; category: string } {
  const meters = Math.max(1, heightCm) / 100;
  const bmi = Number((weightKg / (meters * meters)).toFixed(1));
  let category = 'Bình thường';
  if (bmi < 18.5) category = 'Thiếu cân';
  else if (bmi >= 23 && bmi < 25) category = 'Thừa cân (chuẩn Châu Á)';
  else if (bmi >= 25) category = 'Béo phì (chuẩn Châu Á)';
  return { bmi, category };
}
