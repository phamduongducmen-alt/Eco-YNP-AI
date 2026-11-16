import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBmrMifflinStJeor,
  calculateMacroTargets,
  calculateTdeeAndTarget,
  calculateWorkoutCalories,
  computeBmi,
  computeFoodPortionNutrients,
  sumDailyNutrition,
} from './healthEngine';
import type { FoodCatalogItem, MealLogEntry } from '../types/lifeworld';

test('calculateBmrMifflinStJeor computes accurate male & female BMR', () => {
  const maleBmr = calculateBmrMifflinStJeor({
    weightKg: 70,
    heightCm: 175,
    age: 30,
    sex: 'male',
  });
  // 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75 -> 1649
  assert.equal(maleBmr, 1649);

  const femaleBmr = calculateBmrMifflinStJeor({
    weightKg: 55,
    heightCm: 160,
    age: 25,
    sex: 'female',
  });
  // 550 + 1000 - 125 - 161 = 1264
  assert.equal(femaleBmr, 1264);
});

test('calculateTdeeAndTarget applies activity multiplier and safety floor', () => {
  const result = calculateTdeeAndTarget({
    weightKg: 70,
    heightCm: 175,
    age: 30,
    sex: 'male',
    activityLevel: 'moderate',
    goal: 'lose_fat',
  });
  assert.equal(result.bmr, 1649);
  assert.equal(result.tdee, Math.round(1649 * 1.55));
  assert.equal(result.targetCalories, result.tdee - 400);
});

test('calculateMacroTargets and portion nutrients preserve macro balance', () => {
  const macros = calculateMacroTargets(2100, 'build_muscle', 70);
  assert.equal(macros.proteinG, 126); // 70 * 1.8
  assert.equal(macros.recommendedWaterMl, 2450); // 70 * 35

  const sampleFood: FoodCatalogItem = {
    id: 'salmon',
    name: 'Cá hồi',
    nameEn: 'Salmon',
    category: 'seafood',
    caloriesPer100g: 208,
    proteinPer100g: 20,
    carbsPer100g: 0,
    fatPer100g: 13,
    fiberPer100g: 0,
    sugarPer100g: 0,
    sodiumMgPer100g: 59,
    servingLabel: '150g',
    servingGrams: 150,
    vitaminsMinerals: ['Omega-3', 'Vitamin D'],
    benefits: 'Tốt cho tim mạch',
    allergens: ['Cá'],
    storageGuide: '0-4C',
    shelfLife: '2 ngày',
    processingLevel: 'Tự nhiên (NOVA 1)',
    pairings: ['Bông cải xanh'],
    sourceNote: 'USDA',
  };

  const portion = computeFoodPortionNutrients(sampleFood, 150);
  assert.equal(portion.calories, 312);
  assert.equal(portion.proteinG, 30);
  assert.equal(portion.fatG, 19.5);
});

test('sumDailyNutrition and calculateWorkoutCalories compute exact totals', () => {
  const meals: MealLogEntry[] = [
    {
      id: 'm1',
      name: 'Phở gà',
      mealSlot: 'breakfast',
      grams: 450,
      calories: 420,
      proteinG: 28,
      carbsG: 52,
      fatG: 9,
      fiberG: 3,
      sugarG: 4,
      sodiumMg: 980,
      sourceType: 'manual',
      loggedAt: '2026-11-14T08:00:00Z',
    },
    {
      id: 'm2',
      name: 'Sữa chua Hy Lạp',
      mealSlot: 'snack',
      grams: 150,
      calories: 130,
      proteinG: 15,
      carbsG: 6,
      fatG: 4,
      fiberG: 0,
      sugarG: 5,
      sodiumMg: 55,
      sourceType: 'library',
      loggedAt: '2026-11-14T15:00:00Z',
    },
  ];
  const totals = sumDailyNutrition(meals);
  assert.equal(totals.calories, 550);
  assert.equal(totals.proteinG, 43);
  assert.equal(totals.sodiumMg, 1035);

  // 8 MET * 70kg * 0.5h = 280 kcal
  assert.equal(calculateWorkoutCalories(8, 70, 30), 280);
  assert.equal(computeBmi(68, 172).bmi, 23);
});
