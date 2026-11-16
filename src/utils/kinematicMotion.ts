import type { ExerciseEquipmentProp, ExerciseItem } from '../types/lifeworld';

export interface Joint2D {
  x: number;
  y: number;
}

export interface AthletePoseFrame {
  poseLabel: string;
  repPhasePct: number;
  head: Joint2D;
  neck: Joint2D;
  shoulderL: Joint2D;
  shoulderR: Joint2D;
  elbowL: Joint2D;
  elbowR: Joint2D;
  handL: Joint2D;
  handR: Joint2D;
  hipCenter: Joint2D;
  hipL: Joint2D;
  hipR: Joint2D;
  kneeL: Joint2D;
  kneeR: Joint2D;
  ankleL: Joint2D;
  ankleR: Joint2D;
  activeMuscleGroup: 'core' | 'legs' | 'upper' | 'spine' | 'cardio';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpJoint(a: Joint2D, b: Joint2D, t: number): Joint2D {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function smoothWave(phaseSec: number, cycleSec = 4): number {
  const angle = ((phaseSec % cycleSec) / cycleSec) * Math.PI * 2;
  return 0.5 - 0.5 * Math.cos(angle); // Smooth 0 -> 1 -> 0 easing
}

export function getExerciseEquipmentProp(
  exerciseOrPose: Pick<ExerciseItem, 'poseType' | 'equipmentProp'> | ExerciseItem['poseType']
): ExerciseEquipmentProp {
  if (typeof exerciseOrPose === 'string') {
    switch (exerciseOrPose) {
      case 'pullup_row':
        return 'pullup_bar';
      case 'pike_dips':
      case 'l_sit':
        return 'parallettes';
      case 'gym_press':
        return 'dumbbells';
      case 'dumbbell_row':
        return 'bench_dumbbell';
      case 'agility_drill':
        return 'agility_ladder';
      case 'running_stride':
        return 'running_track';
      case 'boxing_guard':
        return 'boxing_bag';
      case 'lunge_twist':
        return 'soccer_ball';
      case 'single_leg_rdl':
        return 'resistance_cones';
      case 'warrior':
      case 'pigeon_pose':
        return 'yoga_blocks';
      case 'seated_posture':
        return 'chair';
      default:
        return 'yoga_mat';
    }
  }
  if (exerciseOrPose.equipmentProp) return exerciseOrPose.equipmentProp;
  return getExerciseEquipmentProp(exerciseOrPose.poseType);
}

export function getEquipmentPropLabelVi(prop: ExerciseEquipmentProp): string {
  switch (prop) {
    case 'pullup_bar':
      return 'Xà đơn & khung treo';
    case 'parallettes':
      return 'Thanh Parallettes / Xà kép';
    case 'goblet_dumbbell':
      return 'Tạ đơn Goblet trước ngực';
    case 'dumbbells':
      return 'Cặp tạ đơn Gym';
    case 'bench_dumbbell':
      return 'Ghế tập & Tạ đơn kéo lưng';
    case 'soccer_ball':
      return 'Bóng đá & Nón mốc sân cỏ';
    case 'agility_ladder':
      return 'Thang dây Agility & Nón tốc độ';
    case 'resistance_cones':
      return 'Dây kháng lực & Nón giữ trục';
    case 'running_track':
      return 'Đường chạy tốc độ & Cọc nhịp';
    case 'boxing_bag':
      return 'Bao cát đấm bốc & Găng Boxing';
    case 'yoga_blocks':
      return 'Thảm Yoga & Gạch hỗ trợ';
    case 'chair':
      return 'Ghế công thái học văn phòng';
    case 'yoga_mat':
    default:
      return 'Thảm tập chống trượt';
  }
}

/**
 * Pure biomechanical kinematic keyframe synthesizer for Home Fitness exercises.
 * Coordinates are normalized in a [0..1, 0..1] viewport plane (floor around y = 0.84).
 * Optional stepIndex shifts phase focus so each step visibly emphasizes its target posture.
 */
export function computeAthletePoseFrame(
  poseType: ExerciseItem['poseType'],
  elapsedSec: number,
  stepIndex = 0
): AthletePoseFrame {
  const fastPose =
    poseType === 'cardio_jump' ||
    poseType === 'agility_drill' ||
    poseType === 'running_stride' ||
    poseType === 'boxing_guard';
  const baseWave = smoothWave(elapsedSec, fastPose ? 1.6 : 4.2);
  // Subtle step-linked emphasis (step 0: balanced setup -> step 1/2: deeper working phase -> step 3+: peak control)
  const stepBias = stepIndex === 0 ? 0.88 : stepIndex === 1 ? 1.0 : stepIndex === 2 ? 1.08 : 0.96;
  const wave = Math.max(0, Math.min(1, baseWave * stepBias));
  const microBreath = Math.sin(elapsedSec * 2.4) * 0.008;

  if (poseType === 'squat') {
    const stand: AthletePoseFrame = {
      poseLabel: 'Đứng chuẩn bị · Giữ ngực mở & siết cơ lõi',
      repPhasePct: 0,
      head: { x: 0.48, y: 0.24 },
      neck: { x: 0.48, y: 0.31 },
      shoulderL: { x: 0.44, y: 0.34 },
      shoulderR: { x: 0.52, y: 0.34 },
      elbowL: { x: 0.44, y: 0.45 },
      elbowR: { x: 0.54, y: 0.45 },
      handL: { x: 0.49, y: 0.41 },
      handR: { x: 0.53, y: 0.41 },
      hipCenter: { x: 0.48, y: 0.53 },
      hipL: { x: 0.45, y: 0.53 },
      hipR: { x: 0.51, y: 0.53 },
      kneeL: { x: 0.44, y: 0.68 },
      kneeR: { x: 0.52, y: 0.68 },
      ankleL: { x: 0.43, y: 0.84 },
      ankleR: { x: 0.53, y: 0.84 },
      activeMuscleGroup: 'legs',
    };
    const deep: AthletePoseFrame = {
      poseLabel: 'Hạ hông song song sàn · Đầu gối mở thẳng mũi chân',
      repPhasePct: 100,
      head: { x: 0.44, y: 0.37 },
      neck: { x: 0.44, y: 0.43 },
      shoulderL: { x: 0.41, y: 0.46 },
      shoulderR: { x: 0.48, y: 0.46 },
      elbowL: { x: 0.49, y: 0.55 },
      elbowR: { x: 0.55, y: 0.55 },
      handL: { x: 0.54, y: 0.48 },
      handR: { x: 0.58, y: 0.48 },
      hipCenter: { x: 0.38, y: 0.67 },
      hipL: { x: 0.36, y: 0.67 },
      hipR: { x: 0.41, y: 0.67 },
      kneeL: { x: 0.54, y: 0.67 },
      kneeR: { x: 0.58, y: 0.68 },
      ankleL: { x: 0.47, y: 0.84 },
      ankleR: { x: 0.54, y: 0.84 },
      activeMuscleGroup: 'legs',
    };
    return interpolatePose(stand, deep, wave, wave > 0.55 ? deep.poseLabel : stand.poseLabel);
  }

  if (poseType === 'pushup') {
    const up: AthletePoseFrame = {
      poseLabel: 'Plank cao · Khóa trục vai–hông–gót chân',
      repPhasePct: 0,
      head: { x: 0.72, y: 0.46 },
      neck: { x: 0.67, y: 0.49 },
      shoulderL: { x: 0.63, y: 0.51 },
      shoulderR: { x: 0.65, y: 0.53 },
      elbowL: { x: 0.64, y: 0.67 },
      elbowR: { x: 0.66, y: 0.68 },
      handL: { x: 0.65, y: 0.83 },
      handR: { x: 0.67, y: 0.83 },
      hipCenter: { x: 0.43, y: 0.62 },
      hipL: { x: 0.43, y: 0.61 },
      hipR: { x: 0.44, y: 0.63 },
      kneeL: { x: 0.31, y: 0.72 },
      kneeR: { x: 0.31, y: 0.73 },
      ankleL: { x: 0.19, y: 0.82 },
      ankleR: { x: 0.19, y: 0.83 },
      activeMuscleGroup: 'upper',
    };
    const down: AthletePoseFrame = {
      poseLabel: 'Hạ ngực khép khuỷu 45° · Đẩy đồng bộ toàn thân',
      repPhasePct: 100,
      head: { x: 0.73, y: 0.63 },
      neck: { x: 0.68, y: 0.66 },
      shoulderL: { x: 0.64, y: 0.68 },
      shoulderR: { x: 0.66, y: 0.69 },
      elbowL: { x: 0.57, y: 0.67 },
      elbowR: { x: 0.59, y: 0.69 },
      handL: { x: 0.65, y: 0.83 },
      handR: { x: 0.67, y: 0.83 },
      hipCenter: { x: 0.43, y: 0.73 },
      hipL: { x: 0.43, y: 0.72 },
      hipR: { x: 0.44, y: 0.74 },
      kneeL: { x: 0.31, y: 0.78 },
      kneeR: { x: 0.31, y: 0.79 },
      ankleL: { x: 0.19, y: 0.82 },
      ankleR: { x: 0.19, y: 0.83 },
      activeMuscleGroup: 'upper',
    };
    return interpolatePose(up, down, wave, wave > 0.5 ? down.poseLabel : up.poseLabel);
  }

  if (poseType === 'pike_dips') {
    const highPike: AthletePoseFrame = {
      poseLabel: 'Thế Pike V ngược trên Parallettes · Đẩy vai cao',
      repPhasePct: 0,
      head: { x: 0.64, y: 0.5 },
      neck: { x: 0.6, y: 0.47 },
      shoulderL: { x: 0.57, y: 0.49 },
      shoulderR: { x: 0.6, y: 0.51 },
      elbowL: { x: 0.59, y: 0.63 },
      elbowR: { x: 0.61, y: 0.64 },
      handL: { x: 0.6, y: 0.77 },
      handR: { x: 0.63, y: 0.77 },
      hipCenter: { x: 0.44, y: 0.3 },
      hipL: { x: 0.43, y: 0.3 },
      hipR: { x: 0.45, y: 0.31 },
      kneeL: { x: 0.33, y: 0.55 },
      kneeR: { x: 0.35, y: 0.56 },
      ankleL: { x: 0.22, y: 0.82 },
      ankleR: { x: 0.24, y: 0.83 },
      activeMuscleGroup: 'upper',
    };
    const lowPike: AthletePoseFrame = {
      ...highPike,
      poseLabel: 'Hạ đầu tạo tam giác trước thanh Parallettes · Khuỷu khép 45°',
      repPhasePct: 100,
      head: { x: 0.69, y: 0.67 },
      neck: { x: 0.64, y: 0.62 },
      shoulderL: { x: 0.6, y: 0.61 },
      shoulderR: { x: 0.63, y: 0.62 },
      elbowL: { x: 0.54, y: 0.63 },
      elbowR: { x: 0.56, y: 0.64 },
      hipCenter: { x: 0.45, y: 0.38 },
      hipL: { x: 0.44, y: 0.38 },
      hipR: { x: 0.46, y: 0.39 },
      kneeL: { x: 0.34, y: 0.59 },
      kneeR: { x: 0.36, y: 0.6 },
    };
    return interpolatePose(highPike, lowPike, wave, wave > 0.5 ? lowPike.poseLabel : highPike.poseLabel);
  }

  if (poseType === 'l_sit') {
    const tuckLsit: AthletePoseFrame = {
      poseLabel: 'Tuck L-Sit trên Parallettes · Ấn mạnh vai xa tai',
      repPhasePct: 0,
      head: { x: 0.41, y: 0.3 },
      neck: { x: 0.41, y: 0.37 },
      shoulderL: { x: 0.41, y: 0.41 },
      shoulderR: { x: 0.44, y: 0.41 },
      elbowL: { x: 0.41, y: 0.58 },
      elbowR: { x: 0.45, y: 0.58 },
      handL: { x: 0.42, y: 0.74 },
      handR: { x: 0.46, y: 0.74 },
      hipCenter: { x: 0.42, y: 0.64 },
      hipL: { x: 0.41, y: 0.64 },
      hipR: { x: 0.43, y: 0.65 },
      kneeL: { x: 0.55, y: 0.59 },
      kneeR: { x: 0.57, y: 0.6 },
      ankleL: { x: 0.59, y: 0.69 },
      ankleR: { x: 0.61, y: 0.7 },
      activeMuscleGroup: 'core',
    };
    const fullLsit: AthletePoseFrame = {
      ...tuckLsit,
      poseLabel: 'Full L-Sit chuẩn · Duỗi thẳng hai chân song song sàn',
      repPhasePct: 100,
      head: { x: 0.41, y: 0.29 + microBreath },
      hipCenter: { x: 0.42, y: 0.62 },
      kneeL: { x: 0.59, y: 0.61 },
      kneeR: { x: 0.61, y: 0.62 },
      ankleL: { x: 0.74, y: 0.6 },
      ankleR: { x: 0.76, y: 0.61 },
    };
    return interpolatePose(tuckLsit, fullLsit, wave, wave > 0.45 ? fullLsit.poseLabel : tuckLsit.poseLabel);
  }

  if (poseType === 'dumbbell_row') {
    const lowerRow: AthletePoseFrame = {
      poseLabel: 'Chống tay trên ghế giữ lưng phẳng · Duỗi giãn cơ xô',
      repPhasePct: 0,
      head: { x: 0.68, y: 0.36 },
      neck: { x: 0.63, y: 0.39 },
      shoulderL: { x: 0.59, y: 0.41 },
      shoulderR: { x: 0.61, y: 0.43 },
      elbowL: { x: 0.61, y: 0.53 },
      elbowR: { x: 0.59, y: 0.58 },
      handL: { x: 0.62, y: 0.63 },
      handR: { x: 0.58, y: 0.74 },
      hipCenter: { x: 0.4, y: 0.46 },
      hipL: { x: 0.4, y: 0.45 },
      hipR: { x: 0.41, y: 0.47 },
      kneeL: { x: 0.42, y: 0.64 },
      kneeR: { x: 0.33, y: 0.65 },
      ankleL: { x: 0.31, y: 0.66 },
      ankleR: { x: 0.28, y: 0.84 },
      activeMuscleGroup: 'upper',
    };
    const pullRow: AthletePoseFrame = {
      ...lowerRow,
      poseLabel: 'Thở ra kéo tạ đơn sát hông · Siết chặt lưng giữa',
      repPhasePct: 100,
      elbowR: { x: 0.49, y: 0.36 },
      handR: { x: 0.52, y: 0.52 },
    };
    return interpolatePose(lowerRow, pullRow, wave, wave > 0.5 ? pullRow.poseLabel : lowerRow.poseLabel);
  }

  if (poseType === 'single_leg_rdl') {
    const balanced: AthletePoseFrame = {
      poseLabel: 'Đứng trụ một chân hơi chùng gối · Khóa thăng bằng hông',
      repPhasePct: 0,
      head: { x: 0.48, y: 0.24 },
      neck: { x: 0.48, y: 0.31 },
      shoulderL: { x: 0.45, y: 0.34 },
      shoulderR: { x: 0.51, y: 0.34 },
      elbowL: { x: 0.45, y: 0.46 },
      elbowR: { x: 0.52, y: 0.46 },
      handL: { x: 0.46, y: 0.57 },
      handR: { x: 0.53, y: 0.57 },
      hipCenter: { x: 0.47, y: 0.53 },
      hipL: { x: 0.45, y: 0.53 },
      hipR: { x: 0.49, y: 0.53 },
      kneeL: { x: 0.45, y: 0.68 },
      kneeR: { x: 0.5, y: 0.68 },
      ankleL: { x: 0.39, y: 0.79 },
      ankleR: { x: 0.5, y: 0.84 },
      activeMuscleGroup: 'legs',
    };
    const hingeT: AthletePoseFrame = {
      poseLabel: 'Gập hông chữ T · Đá thẳng chân sau bảo vệ dây chằng gối',
      repPhasePct: 100,
      head: { x: 0.72, y: 0.44 },
      neck: { x: 0.67, y: 0.46 },
      shoulderL: { x: 0.62, y: 0.47 },
      shoulderR: { x: 0.63, y: 0.49 },
      elbowL: { x: 0.62, y: 0.6 },
      elbowR: { x: 0.64, y: 0.61 },
      handL: { x: 0.6, y: 0.71 },
      handR: { x: 0.62, y: 0.72 },
      hipCenter: { x: 0.46, y: 0.52 },
      hipL: { x: 0.45, y: 0.52 },
      hipR: { x: 0.47, y: 0.53 },
      kneeL: { x: 0.31, y: 0.49 },
      kneeR: { x: 0.49, y: 0.68 },
      ankleL: { x: 0.17, y: 0.46 },
      ankleR: { x: 0.49, y: 0.84 },
      activeMuscleGroup: 'legs',
    };
    return interpolatePose(balanced, hingeT, wave, wave > 0.45 ? hingeT.poseLabel : balanced.poseLabel);
  }

  if (poseType === 'pigeon_pose') {
    const upright: AthletePoseFrame = {
      poseLabel: 'Thế Bồ Câu (Pigeon Pose) · Cân bằng hông & mở ngực',
      repPhasePct: 0,
      head: { x: 0.52, y: 0.35 },
      neck: { x: 0.51, y: 0.42 },
      shoulderL: { x: 0.49, y: 0.45 },
      shoulderR: { x: 0.53, y: 0.45 },
      elbowL: { x: 0.52, y: 0.58 },
      elbowR: { x: 0.56, y: 0.59 },
      handL: { x: 0.56, y: 0.74 },
      handR: { x: 0.6, y: 0.76 },
      hipCenter: { x: 0.47, y: 0.72 },
      hipL: { x: 0.46, y: 0.71 },
      hipR: { x: 0.48, y: 0.73 },
      kneeL: { x: 0.34, y: 0.78 },
      kneeR: { x: 0.6, y: 0.77 },
      ankleL: { x: 0.19, y: 0.82 },
      ankleR: { x: 0.5, y: 0.81 },
      activeMuscleGroup: 'spine',
    };
    const deepFold: AthletePoseFrame = {
      ...upright,
      poseLabel: 'Thở ra gập thân nhẹ · Giãn sâu khớp háng và cơ hình lê',
      repPhasePct: 100,
      head: { x: 0.65, y: 0.58 },
      neck: { x: 0.6, y: 0.61 },
      shoulderL: { x: 0.57, y: 0.63 },
      shoulderR: { x: 0.6, y: 0.64 },
      elbowL: { x: 0.66, y: 0.74 },
      elbowR: { x: 0.68, y: 0.75 },
      handL: { x: 0.74, y: 0.8 },
      handR: { x: 0.76, y: 0.81 },
    };
    return interpolatePose(upright, deepFold, wave, wave > 0.5 ? deepFold.poseLabel : upright.poseLabel);
  }

  if (poseType === 'seated_posture') {
    const chinTuck: AthletePoseFrame = {
      poseLabel: 'Ngồi thẳng lưng trên ghế · Kéo cằm ngang chỉnh trục cổ',
      repPhasePct: 0,
      head: { x: 0.47, y: 0.27 },
      neck: { x: 0.47, y: 0.34 },
      shoulderL: { x: 0.42, y: 0.37 },
      shoulderR: { x: 0.52, y: 0.37 },
      elbowL: { x: 0.37, y: 0.47 },
      elbowR: { x: 0.57, y: 0.47 },
      handL: { x: 0.42, y: 0.55 },
      handR: { x: 0.53, y: 0.55 },
      hipCenter: { x: 0.47, y: 0.58 },
      hipL: { x: 0.44, y: 0.58 },
      hipR: { x: 0.5, y: 0.58 },
      kneeL: { x: 0.56, y: 0.62 },
      kneeR: { x: 0.61, y: 0.63 },
      ankleL: { x: 0.56, y: 0.83 },
      ankleR: { x: 0.61, y: 0.84 },
      activeMuscleGroup: 'spine',
    };
    const wallAngel: AthletePoseFrame = {
      ...chinTuck,
      poseLabel: 'Giãn cổ nghiêng bên & trượt tay chữ W–Y mở vai',
      repPhasePct: 100,
      head: { x: 0.5, y: 0.28 },
      elbowL: { x: 0.35, y: 0.31 },
      elbowR: { x: 0.59, y: 0.31 },
      handL: { x: 0.39, y: 0.19 },
      handR: { x: 0.56, y: 0.19 },
    };
    return interpolatePose(chinTuck, wallAngel, wave, wave > 0.5 ? wallAngel.poseLabel : chinTuck.poseLabel);
  }

  if (poseType === 'plank') {
    return {
      poseLabel: 'Siết cơ bụng sâu · Giữ đường thẳng vai–hông–gót',
      repPhasePct: Math.round(wave * 100),
      head: { x: 0.73, y: 0.56 + microBreath },
      neck: { x: 0.68, y: 0.6 + microBreath },
      shoulderL: { x: 0.63, y: 0.61 + microBreath },
      shoulderR: { x: 0.65, y: 0.63 + microBreath },
      elbowL: { x: 0.63, y: 0.8 },
      elbowR: { x: 0.66, y: 0.81 },
      handL: { x: 0.71, y: 0.82 },
      handR: { x: 0.72, y: 0.83 },
      hipCenter: { x: 0.43, y: 0.67 + microBreath * 0.7 },
      hipL: { x: 0.43, y: 0.66 + microBreath * 0.7 },
      hipR: { x: 0.44, y: 0.68 + microBreath * 0.7 },
      kneeL: { x: 0.3, y: 0.74 },
      kneeR: { x: 0.3, y: 0.75 },
      ankleL: { x: 0.17, y: 0.82 },
      ankleR: { x: 0.17, y: 0.83 },
      activeMuscleGroup: 'core',
    };
  }

  if (poseType === 'bridge') {
    const rest: AthletePoseFrame = {
      poseLabel: 'Chuẩn bị nằm ngửa co gối · Bám vững gót chân',
      repPhasePct: 0,
      head: { x: 0.22, y: 0.74 },
      neck: { x: 0.27, y: 0.76 },
      shoulderL: { x: 0.31, y: 0.77 },
      shoulderR: { x: 0.33, y: 0.78 },
      elbowL: { x: 0.42, y: 0.81 },
      elbowR: { x: 0.43, y: 0.82 },
      handL: { x: 0.53, y: 0.83 },
      handR: { x: 0.54, y: 0.84 },
      hipCenter: { x: 0.49, y: 0.77 },
      hipL: { x: 0.49, y: 0.76 },
      hipR: { x: 0.5, y: 0.78 },
      kneeL: { x: 0.63, y: 0.59 },
      kneeR: { x: 0.65, y: 0.6 },
      ankleL: { x: 0.73, y: 0.82 },
      ankleR: { x: 0.75, y: 0.83 },
      activeMuscleGroup: 'core',
    };
    const lift: AthletePoseFrame = {
      ...rest,
      poseLabel: 'Đẩy hông lên thẳng trục vai–hông–gối · Siết mông',
      repPhasePct: 100,
      hipCenter: { x: 0.49, y: 0.62 },
      hipL: { x: 0.49, y: 0.61 },
      hipR: { x: 0.5, y: 0.63 },
      kneeL: { x: 0.64, y: 0.54 },
      kneeR: { x: 0.66, y: 0.55 },
    };
    return interpolatePose(rest, lift, wave, wave > 0.5 ? lift.poseLabel : rest.poseLabel);
  }

  if (poseType === 'cardio_jump') {
    const closed: AthletePoseFrame = {
      poseLabel: 'Thu chân nhanh · Hạ mũi chân đàn hồi',
      repPhasePct: 0,
      head: { x: 0.5, y: 0.22 },
      neck: { x: 0.5, y: 0.29 },
      shoulderL: { x: 0.44, y: 0.32 },
      shoulderR: { x: 0.56, y: 0.32 },
      elbowL: { x: 0.41, y: 0.45 },
      elbowR: { x: 0.59, y: 0.45 },
      handL: { x: 0.42, y: 0.57 },
      handR: { x: 0.58, y: 0.57 },
      hipCenter: { x: 0.5, y: 0.52 },
      hipL: { x: 0.46, y: 0.52 },
      hipR: { x: 0.54, y: 0.52 },
      kneeL: { x: 0.47, y: 0.68 },
      kneeR: { x: 0.53, y: 0.68 },
      ankleL: { x: 0.47, y: 0.83 },
      ankleR: { x: 0.53, y: 0.83 },
      activeMuscleGroup: 'cardio',
    };
    const open: AthletePoseFrame = {
      poseLabel: 'Bật Jumping Jack · Vươn cao tay nhịp nhàng',
      repPhasePct: 100,
      head: { x: 0.5, y: 0.21 },
      neck: { x: 0.5, y: 0.28 },
      shoulderL: { x: 0.44, y: 0.31 },
      shoulderR: { x: 0.56, y: 0.31 },
      elbowL: { x: 0.37, y: 0.22 },
      elbowR: { x: 0.63, y: 0.22 },
      handL: { x: 0.44, y: 0.14 },
      handR: { x: 0.56, y: 0.14 },
      hipCenter: { x: 0.5, y: 0.5 },
      hipL: { x: 0.46, y: 0.5 },
      hipR: { x: 0.54, y: 0.5 },
      kneeL: { x: 0.4, y: 0.65 },
      kneeR: { x: 0.6, y: 0.65 },
      ankleL: { x: 0.35, y: 0.8 },
      ankleR: { x: 0.65, y: 0.8 },
      activeMuscleGroup: 'cardio',
    };
    return interpolatePose(closed, open, wave, wave > 0.5 ? open.poseLabel : closed.poseLabel);
  }

  if (poseType === 'lunge_twist') {
    const stepLunge: AthletePoseFrame = {
      poseLabel: 'Bước tấn trước 90° · Mở khớp háng & trụ gối',
      repPhasePct: 0,
      head: { x: 0.5, y: 0.29 },
      neck: { x: 0.49, y: 0.36 },
      shoulderL: { x: 0.46, y: 0.39 },
      shoulderR: { x: 0.53, y: 0.4 },
      elbowL: { x: 0.52, y: 0.5 },
      elbowR: { x: 0.58, y: 0.49 },
      handL: { x: 0.58, y: 0.58 },
      handR: { x: 0.63, y: 0.56 },
      hipCenter: { x: 0.45, y: 0.58 },
      hipL: { x: 0.43, y: 0.58 },
      hipR: { x: 0.48, y: 0.58 },
      kneeL: { x: 0.32, y: 0.72 },
      kneeR: { x: 0.61, y: 0.65 },
      ankleL: { x: 0.21, y: 0.83 },
      ankleR: { x: 0.62, y: 0.84 },
      activeMuscleGroup: 'legs',
    };
    const twistReach: AthletePoseFrame = {
      ...stepLunge,
      poseLabel: 'Xoay ngực mở vai · Chuẩn FIFA 11+ sẵn sàng sân cỏ',
      repPhasePct: 100,
      head: { x: 0.52, y: 0.27 },
      shoulderL: { x: 0.49, y: 0.36 },
      shoulderR: { x: 0.56, y: 0.38 },
      elbowL: { x: 0.5, y: 0.25 },
      handL: { x: 0.51, y: 0.15 },
      elbowR: { x: 0.61, y: 0.51 },
      handR: { x: 0.63, y: 0.62 },
    };
    return interpolatePose(
      stepLunge,
      twistReach,
      wave,
      wave > 0.5 ? twistReach.poseLabel : stepLunge.poseLabel
    );
  }

  if (poseType === 'warrior') {
    const enter: AthletePoseFrame = {
      poseLabel: 'Chân trước vuông góc 90° · Hai tay dang ngang mở ngực',
      repPhasePct: 0,
      head: { x: 0.5, y: 0.27 },
      neck: { x: 0.5, y: 0.34 },
      shoulderL: { x: 0.45, y: 0.37 },
      shoulderR: { x: 0.55, y: 0.37 },
      elbowL: { x: 0.34, y: 0.37 },
      elbowR: { x: 0.66, y: 0.37 },
      handL: { x: 0.23, y: 0.37 },
      handR: { x: 0.77, y: 0.37 },
      hipCenter: { x: 0.5, y: 0.56 },
      hipL: { x: 0.46, y: 0.56 },
      hipR: { x: 0.54, y: 0.56 },
      kneeL: { x: 0.36, y: 0.69 },
      kneeR: { x: 0.66, y: 0.66 },
      ankleL: { x: 0.28, y: 0.84 },
      ankleR: { x: 0.69, y: 0.84 },
      activeMuscleGroup: 'legs',
    };
    const deepWarrior: AthletePoseFrame = {
      ...enter,
      poseLabel: 'Chiến Binh II chuẩn trục · Vươn dài cột sống',
      repPhasePct: 100,
      head: { x: 0.51, y: 0.3 },
      neck: { x: 0.51, y: 0.37 },
      shoulderL: { x: 0.46, y: 0.39 },
      shoulderR: { x: 0.56, y: 0.39 },
      elbowL: { x: 0.35, y: 0.39 },
      elbowR: { x: 0.67, y: 0.36 },
      handL: { x: 0.24, y: 0.38 },
      handR: { x: 0.78, y: 0.32 },
      hipCenter: { x: 0.51, y: 0.59 },
      hipL: { x: 0.47, y: 0.59 },
      hipR: { x: 0.55, y: 0.59 },
    };
    return interpolatePose(enter, deepWarrior, wave, wave > 0.5 ? deepWarrior.poseLabel : enter.poseLabel);
  }

  if (poseType === 'stretch') {
    const start: AthletePoseFrame = {
      poseLabel: 'Hít sâu vươn dài cột sống · Thả lỏng cổ vai',
      repPhasePct: 0,
      head: { x: 0.55, y: 0.56 },
      neck: { x: 0.5, y: 0.59 },
      shoulderL: { x: 0.48, y: 0.6 },
      shoulderR: { x: 0.5, y: 0.62 },
      elbowL: { x: 0.6, y: 0.67 },
      elbowR: { x: 0.61, y: 0.69 },
      handL: { x: 0.72, y: 0.79 },
      handR: { x: 0.73, y: 0.8 },
      hipCenter: { x: 0.31, y: 0.67 },
      hipL: { x: 0.3, y: 0.66 },
      hipR: { x: 0.32, y: 0.68 },
      kneeL: { x: 0.44, y: 0.78 },
      kneeR: { x: 0.45, y: 0.79 },
      ankleL: { x: 0.24, y: 0.81 },
      ankleR: { x: 0.24, y: 0.82 },
      activeMuscleGroup: 'spine',
    };
    const sink: AthletePoseFrame = {
      ...start,
      poseLabel: 'Thở ra hạ sâu hông về gót · Giãn êm lưng dưới',
      repPhasePct: 100,
      head: { x: 0.57, y: 0.72 },
      neck: { x: 0.51, y: 0.72 },
      shoulderL: { x: 0.48, y: 0.72 },
      shoulderR: { x: 0.5, y: 0.73 },
      elbowL: { x: 0.64, y: 0.77 },
      elbowR: { x: 0.65, y: 0.78 },
      handL: { x: 0.78, y: 0.82 },
      handR: { x: 0.79, y: 0.82 },
      hipCenter: { x: 0.28, y: 0.72 },
      hipL: { x: 0.27, y: 0.71 },
      hipR: { x: 0.29, y: 0.73 },
    };
    return interpolatePose(start, sink, wave, wave > 0.5 ? sink.poseLabel : start.poseLabel);
  }

  if (poseType === 'pullup_row') {
    const hang: AthletePoseFrame = {
      poseLabel: 'Treo xà đơn kiểm soát · Kéo bả vai xuống chuẩn bị',
      repPhasePct: 0,
      head: { x: 0.49, y: 0.29 },
      neck: { x: 0.49, y: 0.35 },
      shoulderL: { x: 0.43, y: 0.38 },
      shoulderR: { x: 0.55, y: 0.38 },
      elbowL: { x: 0.4, y: 0.27 },
      elbowR: { x: 0.58, y: 0.27 },
      handL: { x: 0.41, y: 0.16 },
      handR: { x: 0.57, y: 0.16 },
      hipCenter: { x: 0.49, y: 0.54 },
      hipL: { x: 0.46, y: 0.54 },
      hipR: { x: 0.52, y: 0.54 },
      kneeL: { x: 0.47, y: 0.68 },
      kneeR: { x: 0.52, y: 0.68 },
      ankleL: { x: 0.46, y: 0.81 },
      ankleR: { x: 0.52, y: 0.81 },
      activeMuscleGroup: 'upper',
    };
    const pull: AthletePoseFrame = {
      poseLabel: 'Kéo ngực chạm xà · Siết chặt cơ xô và cơ lõi',
      repPhasePct: 100,
      head: { x: 0.49, y: 0.18 },
      neck: { x: 0.49, y: 0.24 },
      shoulderL: { x: 0.43, y: 0.27 },
      shoulderR: { x: 0.55, y: 0.27 },
      elbowL: { x: 0.37, y: 0.37 },
      elbowR: { x: 0.61, y: 0.37 },
      handL: { x: 0.41, y: 0.16 },
      handR: { x: 0.57, y: 0.16 },
      hipCenter: { x: 0.49, y: 0.46 },
      hipL: { x: 0.46, y: 0.46 },
      hipR: { x: 0.52, y: 0.46 },
      kneeL: { x: 0.47, y: 0.61 },
      kneeR: { x: 0.52, y: 0.61 },
      ankleL: { x: 0.46, y: 0.76 },
      ankleR: { x: 0.52, y: 0.76 },
      activeMuscleGroup: 'upper',
    };
    return interpolatePose(hang, pull, wave, wave > 0.5 ? pull.poseLabel : hang.poseLabel);
  }

  if (poseType === 'agility_drill' || poseType === 'running_stride') {
    const strideWave = smoothWave(elapsedSec, poseType === 'running_stride' ? 1.25 : 1.4);
    const isRun = poseType === 'running_stride';
    const stepA: AthletePoseFrame = {
      poseLabel: isRun
        ? 'Nghiêng nhẹ mắt cá 5° · Tiếp đất êm dưới trọng tâm'
        : 'Hạ trọng tâm thấp · Bước nhanh trên thang dây Agility',
      repPhasePct: 0,
      head: { x: 0.51, y: isRun ? 0.21 : 0.24 },
      neck: { x: 0.49, y: isRun ? 0.28 : 0.31 },
      shoulderL: { x: 0.45, y: isRun ? 0.31 : 0.34 },
      shoulderR: { x: 0.53, y: isRun ? 0.31 : 0.34 },
      elbowL: { x: 0.38, y: 0.41 },
      elbowR: { x: 0.59, y: 0.4 },
      handL: { x: 0.42, y: 0.33 },
      handR: { x: 0.65, y: 0.45 },
      hipCenter: { x: 0.47, y: 0.52 },
      hipL: { x: 0.44, y: 0.52 },
      hipR: { x: 0.5, y: 0.52 },
      kneeL: { x: 0.57, y: 0.62 },
      kneeR: { x: 0.39, y: 0.68 },
      ankleL: { x: 0.55, y: 0.75 },
      ankleR: { x: 0.33, y: 0.83 },
      activeMuscleGroup: isRun ? 'cardio' : 'legs',
    };
    const stepB: AthletePoseFrame = {
      poseLabel: isRun
        ? 'Guồng chân 175+ bước/phút · Đánh tay góc 90° dọc sườn'
        : 'Đổi trụ bứt tốc · Chạm mũi chân qua nón tốc độ',
      repPhasePct: 100,
      head: { x: 0.52, y: isRun ? 0.2 : 0.23 },
      neck: { x: 0.5, y: isRun ? 0.27 : 0.3 },
      shoulderL: { x: 0.46, y: isRun ? 0.3 : 0.33 },
      shoulderR: { x: 0.54, y: isRun ? 0.3 : 0.33 },
      elbowL: { x: 0.58, y: 0.41 },
      elbowR: { x: 0.4, y: 0.42 },
      handL: { x: 0.64, y: 0.35 },
      handR: { x: 0.35, y: 0.47 },
      hipCenter: { x: 0.48, y: 0.51 },
      hipL: { x: 0.45, y: 0.51 },
      hipR: { x: 0.51, y: 0.51 },
      kneeL: { x: 0.39, y: 0.68 },
      kneeR: { x: 0.58, y: 0.61 },
      ankleL: { x: 0.34, y: 0.83 },
      ankleR: { x: 0.57, y: 0.75 },
      activeMuscleGroup: isRun ? 'cardio' : 'legs',
    };
    return interpolatePose(
      stepA,
      stepB,
      strideWave,
      strideWave > 0.5 ? stepB.poseLabel : stepA.poseLabel
    );
  }

  if (poseType === 'gym_press') {
    const lowered: AthletePoseFrame = {
      poseLabel: 'Hạ tạ đơn có kiểm soát · Khuỷu tay khép góc 45°',
      repPhasePct: 0,
      head: { x: 0.23, y: 0.73 },
      neck: { x: 0.28, y: 0.75 },
      shoulderL: { x: 0.32, y: 0.76 },
      shoulderR: { x: 0.34, y: 0.77 },
      elbowL: { x: 0.33, y: 0.82 },
      elbowR: { x: 0.36, y: 0.83 },
      handL: { x: 0.34, y: 0.66 },
      handR: { x: 0.38, y: 0.67 },
      hipCenter: { x: 0.51, y: 0.77 },
      hipL: { x: 0.5, y: 0.76 },
      hipR: { x: 0.52, y: 0.78 },
      kneeL: { x: 0.65, y: 0.6 },
      kneeR: { x: 0.67, y: 0.61 },
      ankleL: { x: 0.74, y: 0.83 },
      ankleR: { x: 0.76, y: 0.84 },
      activeMuscleGroup: 'upper',
    };
    const pressed: AthletePoseFrame = {
      ...lowered,
      poseLabel: 'Thở ra đẩy hai tạ đơn thẳng trục ngực',
      repPhasePct: 100,
      elbowL: { x: 0.33, y: 0.62 },
      elbowR: { x: 0.36, y: 0.63 },
      handL: { x: 0.34, y: 0.45 },
      handR: { x: 0.38, y: 0.46 },
    };
    return interpolatePose(lowered, pressed, wave, wave > 0.5 ? pressed.poseLabel : lowered.poseLabel);
  }

  if (poseType === 'boxing_guard') {
    const punchWave = smoothWave(elapsedSec, 1.8);
    const guard: AthletePoseFrame = {
      poseLabel: 'Thủ thế Orthodox · Găng che xương gò má, hai chân nhún nhịp',
      repPhasePct: 0,
      head: { x: 0.45, y: 0.22 },
      neck: { x: 0.45, y: 0.29 },
      shoulderL: { x: 0.41, y: 0.33 },
      shoulderR: { x: 0.5, y: 0.34 },
      elbowL: { x: 0.46, y: 0.43 },
      elbowR: { x: 0.53, y: 0.42 },
      handL: { x: 0.51, y: 0.29 },
      handR: { x: 0.49, y: 0.3 },
      hipCenter: { x: 0.44, y: 0.53 },
      hipL: { x: 0.41, y: 0.53 },
      hipR: { x: 0.47, y: 0.53 },
      kneeL: { x: 0.37, y: 0.69 },
      kneeR: { x: 0.52, y: 0.68 },
      ankleL: { x: 0.32, y: 0.84 },
      ankleR: { x: 0.56, y: 0.84 },
      activeMuscleGroup: 'cardio',
    };
    const jabCross: AthletePoseFrame = {
      ...guard,
      poseLabel: 'Tung đòn thẳng Jab–Cross vào bao cát · Xoay hông phát lực',
      repPhasePct: 100,
      head: { x: 0.47, y: 0.23 },
      shoulderL: { x: 0.44, y: 0.33 },
      shoulderR: { x: 0.52, y: 0.33 },
      elbowL: { x: 0.57, y: 0.31 },
      handL: { x: 0.69, y: 0.29 },
      elbowR: { x: 0.49, y: 0.41 },
      handR: { x: 0.48, y: 0.29 },
    };
    return interpolatePose(guard, jabCross, punchWave, punchWave > 0.5 ? jabCross.poseLabel : guard.poseLabel);
  }

  // sun_salutation default: upright Tadasana overhead reach -> forward fold
  const reachUp: AthletePoseFrame = {
    poseLabel: 'Hít vào vươn tay qua đầu · Mở rộng lồng ngực',
    repPhasePct: 0,
    head: { x: 0.45, y: 0.25 },
    neck: { x: 0.45, y: 0.32 },
    shoulderL: { x: 0.42, y: 0.35 },
    shoulderR: { x: 0.48, y: 0.35 },
    elbowL: { x: 0.43, y: 0.23 },
    elbowR: { x: 0.49, y: 0.23 },
    handL: { x: 0.44, y: 0.14 },
    handR: { x: 0.49, y: 0.14 },
    hipCenter: { x: 0.45, y: 0.54 },
    hipL: { x: 0.43, y: 0.54 },
    hipR: { x: 0.47, y: 0.54 },
    kneeL: { x: 0.43, y: 0.69 },
    kneeR: { x: 0.47, y: 0.69 },
    ankleL: { x: 0.43, y: 0.84 },
    ankleR: { x: 0.47, y: 0.84 },
    activeMuscleGroup: 'spine',
  };
  const fold: AthletePoseFrame = {
    poseLabel: 'Thở ra gập người từ khớp hông · Thả lỏng vai cổ',
    repPhasePct: 100,
    head: { x: 0.58, y: 0.65 },
    neck: { x: 0.54, y: 0.59 },
    shoulderL: { x: 0.53, y: 0.55 },
    shoulderR: { x: 0.55, y: 0.57 },
    elbowL: { x: 0.54, y: 0.69 },
    elbowR: { x: 0.57, y: 0.7 },
    handL: { x: 0.51, y: 0.82 },
    handR: { x: 0.54, y: 0.82 },
    hipCenter: { x: 0.42, y: 0.52 },
    hipL: { x: 0.41, y: 0.52 },
    hipR: { x: 0.43, y: 0.52 },
    kneeL: { x: 0.43, y: 0.68 },
    kneeR: { x: 0.45, y: 0.68 },
    ankleL: { x: 0.42, y: 0.84 },
    ankleR: { x: 0.45, y: 0.84 },
    activeMuscleGroup: 'spine',
  };
  return interpolatePose(reachUp, fold, wave, wave > 0.5 ? fold.poseLabel : reachUp.poseLabel);
}

/**
 * Smoothly blends between two kinematic frames during step jumps or exercise transitions (ease-out cubic).
 */
export function blendAthletePoseFrames(
  from: AthletePoseFrame,
  to: AthletePoseFrame,
  alpha: number
): AthletePoseFrame {
  const clamped = Math.max(0, Math.min(1, alpha));
  const eased = 1 - Math.pow(1 - clamped, 3);
  return {
    ...interpolatePose(from, to, eased, to.poseLabel),
    activeMuscleGroup: to.activeMuscleGroup,
    repPhasePct: to.repPhasePct,
  };
}

function interpolatePose(
  a: AthletePoseFrame,
  b: AthletePoseFrame,
  t: number,
  poseLabel: string
): AthletePoseFrame {
  return {
    poseLabel,
    repPhasePct: Math.round(t * 100),
    head: lerpJoint(a.head, b.head, t),
    neck: lerpJoint(a.neck, b.neck, t),
    shoulderL: lerpJoint(a.shoulderL, b.shoulderL, t),
    shoulderR: lerpJoint(a.shoulderR, b.shoulderR, t),
    elbowL: lerpJoint(a.elbowL, b.elbowL, t),
    elbowR: lerpJoint(a.elbowR, b.elbowR, t),
    handL: lerpJoint(a.handL, b.handL, t),
    handR: lerpJoint(a.handR, b.handR, t),
    hipCenter: lerpJoint(a.hipCenter, b.hipCenter, t),
    hipL: lerpJoint(a.hipL, b.hipL, t),
    hipR: lerpJoint(a.hipR, b.hipR, t),
    kneeL: lerpJoint(a.kneeL, b.kneeL, t),
    kneeR: lerpJoint(a.kneeR, b.kneeR, t),
    ankleL: lerpJoint(a.ankleL, b.ankleL, t),
    ankleR: lerpJoint(a.ankleR, b.ankleR, t),
    activeMuscleGroup: a.activeMuscleGroup,
  };
}

function drawDumbbell2D(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  scale: number,
  vertical = false
) {
  ctx.save();
  ctx.translate(cx, cy);
  if (vertical) ctx.rotate(Math.PI / 2);

  // Knurled chrome handle
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(-10 * scale, -2.2 * scale, 20 * scale, 4.4 * scale);

  // Left & Right Hex Weight Plates
  ctx.fillStyle = '#1e293b';
  ctx.strokeStyle = '#ff6b1a';
  ctx.lineWidth = 1.4 * scale;
  ctx.beginPath();
  ctx.roundRect(-16 * scale, -8.5 * scale, 7.5 * scale, 17 * scale, 2.5 * scale);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.roundRect(8.5 * scale, -8.5 * scale, 7.5 * scale, 17 * scale, 2.5 * scale);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawEquipmentBackground2D(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scale: number,
  pose: AthletePoseFrame,
  equipment: ExerciseEquipmentProp
) {
  const matY = height * 0.84;

  // Matte Carbon Fitness Mat / Turf / Track Floor
  if (equipment === 'soccer_ball' || equipment === 'agility_ladder' || equipment === 'resistance_cones') {
    ctx.fillStyle = 'rgba(16, 48, 34, 0.92)';
    ctx.beginPath();
    ctx.roundRect(width * 0.12, matY - 5, width * 0.76, 13, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  } else if (equipment === 'running_track') {
    ctx.fillStyle = 'rgba(110, 34, 24, 0.85)';
    ctx.beginPath();
    ctx.roundRect(width * 0.1, matY - 5, width * 0.8, 13, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(24, 28, 38, 0.92)';
    ctx.beginPath();
    ctx.roundRect(width * 0.14, matY - 5, width * 0.72, 12, 6);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 107, 26, 0.5)';
    ctx.lineWidth = 1.3;
    ctx.stroke();
  }

  if (equipment === 'pullup_bar') {
    const barY = Math.min(pose.handL.y, pose.handR.y) * height - 2;
    const leftX = width * 0.29;
    const rightX = width * 0.69;
    // Vertical steel uprights
    ctx.fillStyle = '#334155';
    ctx.fillRect(leftX - 4 * scale, barY, 8 * scale, matY - barY);
    ctx.fillRect(rightX - 4 * scale, barY, 8 * scale, matY - barY);
    // Overhead bar + grip pads
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.roundRect(leftX - 8 * scale, barY - 4 * scale, rightX - leftX + 16 * scale, 8 * scale, 4 * scale);
    ctx.fill();
    ctx.fillStyle = '#ff6b1a';
    ctx.fillRect(pose.handL.x * width - 8 * scale, barY - 4.5 * scale, 16 * scale, 9 * scale);
    ctx.fillRect(pose.handR.x * width - 8 * scale, barY - 4.5 * scale, 16 * scale, 9 * scale);
  }

  if (equipment === 'parallettes') {
    const barY = Math.max(pose.handL.y, pose.handR.y) * height + 3 * scale;
    const leftPx = Math.min(pose.handL.x, pose.handR.x) * width - 22 * scale;
    const span = 64 * scale;
    // Parallette feet + legs + wooden/amber bar
    ctx.fillStyle = '#334155';
    ctx.fillRect(leftPx + 6 * scale, barY, 5 * scale, matY - barY);
    ctx.fillRect(leftPx + span - 11 * scale, barY, 5 * scale, matY - barY);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(leftPx, matY - 5 * scale, 17 * scale, 5 * scale);
    ctx.fillRect(leftPx + span - 17 * scale, matY - 5 * scale, 17 * scale, 5 * scale);
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(leftPx - 4 * scale, barY - 3 * scale, span + 8 * scale, 6 * scale, 3 * scale);
    ctx.fill();
  }

  if (equipment === 'bench_dumbbell') {
    // Padded gym bench under athlete
    const benchY = height * 0.65;
    ctx.fillStyle = '#334155';
    ctx.fillRect(width * 0.36, benchY + 6 * scale, 8 * scale, matY - benchY - 6 * scale);
    ctx.fillRect(width * 0.61, benchY + 6 * scale, 8 * scale, matY - benchY - 6 * scale);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#ff6b1a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(width * 0.33, benchY - 4 * scale, width * 0.34, 12 * scale, 5 * scale);
    ctx.fill();
    ctx.stroke();
  }

  if (equipment === 'chair') {
    // Studio posture chair
    const seatY = height * 0.6;
    ctx.fillStyle = '#334155';
    ctx.fillRect(width * 0.46, seatY + 8 * scale, 7 * scale, matY - seatY - 8 * scale);
    ctx.fillRect(width * 0.4, matY - 5 * scale, width * 0.15, 5 * scale);
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 1.4;
    // Backrest + seat
    ctx.beginPath();
    ctx.roundRect(width * 0.39, height * 0.38, 9 * scale, seatY - height * 0.36, 4 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(width * 0.39, seatY, width * 0.16, 10 * scale, 4 * scale);
    ctx.fill();
    ctx.stroke();
  }

  if (equipment === 'yoga_blocks') {
    ctx.fillStyle = '#f59e0b';
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(width * 0.72, matY - 16 * scale, 22 * scale, 13 * scale, 3 * scale);
    ctx.fill();
    ctx.stroke();
  }

  if (equipment === 'soccer_ball') {
    // Soccer ball & orange cones on field
    const bx = width * 0.76;
    const by = matY - 12 * scale;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.arc(bx, by, 12 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(bx, by, 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Orange cones
    for (const cx of [width * 0.22, width * 0.85]) {
      ctx.fillStyle = '#ff6b1a';
      ctx.beginPath();
      ctx.moveTo(cx - 8 * scale, matY - 2 * scale);
      ctx.lineTo(cx, matY - 19 * scale);
      ctx.lineTo(cx + 8 * scale, matY - 2 * scale);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (equipment === 'agility_ladder') {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.2 * scale;
    for (let i = 0; i < 6; i++) {
      const rx = width * (0.24 + i * 0.1);
      ctx.beginPath();
      ctx.moveTo(rx, matY - 3 * scale);
      ctx.lineTo(rx + 18 * scale, matY - 3 * scale);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff6b1a';
    ctx.beginPath();
    ctx.moveTo(width * 0.16, matY - 2 * scale);
    ctx.lineTo(width * 0.18, matY - 20 * scale);
    ctx.lineTo(width * 0.2, matY - 2 * scale);
    ctx.closePath();
    ctx.fill();
  }

  if (equipment === 'resistance_cones' || equipment === 'running_track') {
    for (const cx of [width * 0.22, width * 0.78]) {
      ctx.fillStyle = '#ff6b1a';
      ctx.beginPath();
      ctx.moveTo(cx - 7 * scale, matY - 2 * scale);
      ctx.lineTo(cx, matY - 18 * scale);
      ctx.lineTo(cx + 7 * scale, matY - 2 * scale);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (equipment === 'boxing_bag') {
    // Suspended heavy punching bag on the right side
    const bagX = width * 0.77;
    const bagTop = height * 0.16;
    const bagHeight = height * 0.42;
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2 * scale;
    ctx.beginPath();
    ctx.moveTo(bagX, 0);
    ctx.lineTo(bagX, bagTop);
    ctx.stroke();

    const bagGrad = ctx.createLinearGradient(bagX - 18 * scale, 0, bagX + 18 * scale, 0);
    bagGrad.addColorStop(0, '#7f1d1d');
    bagGrad.addColorStop(0.5, '#dc2626');
    bagGrad.addColorStop(1, '#450a0a');
    ctx.fillStyle = bagGrad;
    ctx.beginPath();
    ctx.roundRect(bagX - 20 * scale, bagTop, 40 * scale, bagHeight, 10 * scale);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(bagX - 20 * scale, bagTop + 14 * scale, 40 * scale, 10 * scale);
  }
}

/**
 * Draws a volumetric, anatomically shaded athletic figure + matching workout equipment
 * onto a 2D Canvas (Sport-Tech Obsidian & Amber stage lighting).
 */
export function renderVolumetricAthleteCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pose: AthletePoseFrame,
  playing: boolean,
  equipment: ExerciseEquipmentProp = 'yoga_mat'
): void {
  const px = (j: Joint2D) => ({ x: j.x * width, y: j.y * height });
  const scale = Math.min(width / 640, height / 360);

  // Obsidian Sport-Tech studio backdrop
  const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
  bgGrad.addColorStop(0, '#07080C');
  bgGrad.addColorStop(0.65, '#10131B');
  bgGrad.addColorStop(1, '#090B10');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle architectural grid lines on studio floor
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
  ctx.lineWidth = 1;
  const gridStep = Math.round(width / 16);
  for (let gx = gridStep; gx < width; gx += gridStep) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height * 0.85);
    ctx.stroke();
  }

  // Warm Amber & Soft Slate rim spotlight behind athlete
  const spotX = pose.hipCenter.x * width;
  const spotY = height * 0.52;
  const spot = ctx.createRadialGradient(spotX, spotY, 16, spotX, spotY, width * 0.42);
  spot.addColorStop(0, 'rgba(255, 107, 26, 0.22)');
  spot.addColorStop(0.5, 'rgba(245, 158, 11, 0.08)');
  spot.addColorStop(1, 'rgba(10, 11, 14, 0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, width, height);

  // Equipment stage layer behind athlete
  drawEquipmentBackground2D(ctx, width, height, scale, pose, equipment);

  const drawTaperedLimb = (
    p1: Joint2D,
    p2: Joint2D,
    r1: number,
    r2: number,
    colorStart: string,
    colorEnd: string
  ) => {
    const a = px(p1);
    const b = px(p2);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) {
      ctx.fillStyle = colorStart;
      ctx.beginPath();
      ctx.arc(a.x, a.y, Math.max(r1, r2), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const ang = Math.atan2(dy, dx);
    const nx = -dy / len;
    const ny = dx / len;

    const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    grad.addColorStop(0, colorStart);
    grad.addColorStop(1, colorEnd);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * r1, a.y + ny * r1);
    ctx.lineTo(b.x + nx * r2, b.y + ny * r2);
    ctx.arc(b.x, b.y, r2, ang + Math.PI / 2, ang - Math.PI / 2, true);
    ctx.lineTo(a.x - nx * r1, a.y - ny * r1);
    ctx.arc(a.x, a.y, r1, ang - Math.PI / 2, ang + Math.PI / 2, true);
    ctx.closePath();
    ctx.fill();
  };

  const drawJointDisc = (joint: Joint2D, radius: number, color: string) => {
    const c = px(joint);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radius, 0, Math.PI * 2);
    ctx.fill();
  };

  const chestCenter: Joint2D = {
    x: (pose.shoulderL.x + pose.shoulderR.x) / 2,
    y: (pose.shoulderL.y + pose.shoulderR.y) / 2,
  };

  // Far limbs
  drawTaperedLimb(pose.hipL, pose.kneeL, 11 * scale, 8 * scale, '#1e2230', '#161924');
  drawTaperedLimb(pose.kneeL, pose.ankleL, 8 * scale, 5.2 * scale, '#c28f70', '#aa785a');
  drawJointDisc(pose.kneeL, 7.2 * scale, '#1a1e2a');
  drawTaperedLimb(pose.shoulderL, pose.elbowL, 7.6 * scale, 5.8 * scale, '#be8c6e', '#a87658');
  drawTaperedLimb(pose.elbowL, pose.handL, 5.8 * scale, 4.5 * scale, '#be8c6e', '#a87658');
  drawJointDisc(pose.elbowL, 5.8 * scale, '#b38062');
  drawJointDisc(pose.handL, 4.8 * scale, '#b88566');

  // Far-hand equipment (dumbbells or boxing glove)
  const hLPx = px(pose.handL);
  if (equipment === 'dumbbells') {
    drawDumbbell2D(ctx, hLPx.x, hLPx.y, scale * 0.9, false);
  } else if (equipment === 'boxing_bag') {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.arc(hLPx.x, hLPx.y, 10 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sculpted torso athletic compression tank
  const torsoTop =
    pose.activeMuscleGroup === 'core'
      ? '#ff6b1a'
      : pose.activeMuscleGroup === 'cardio'
        ? '#f59e0b'
        : '#272d3d';
  const torsoBottom = pose.activeMuscleGroup === 'core' ? '#c2410c' : '#181c26';
  drawTaperedLimb(chestCenter, pose.hipCenter, 17.5 * scale, 13.5 * scale, torsoTop, torsoBottom);
  drawTaperedLimb(
    pose.shoulderL,
    pose.shoulderR,
    7.5 * scale,
    7.5 * scale,
    pose.activeMuscleGroup === 'upper' ? '#ff6b1a' : '#30374b',
    pose.activeMuscleGroup === 'upper' ? '#ea580c' : '#242938'
  );
  drawJointDisc(pose.hipCenter, 13 * scale, '#1c202c');

  // Neck & Head with Sport-Tech Amber headband
  drawTaperedLimb(pose.neck, pose.head, 5.4 * scale, 6.2 * scale, '#d9a484', '#c99170');
  const hCenter = px(pose.head);
  ctx.fillStyle = '#e2ae8c';
  ctx.beginPath();
  ctx.arc(hCenter.x, hCenter.y, 13 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff6b1a';
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.arc(hCenter.x, hCenter.y - 1.5 * scale, 12 * scale, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();

  // Near leg
  const legColorTop = pose.activeMuscleGroup === 'legs' ? '#ff6b1a' : '#2c3244';
  const legColorBottom = pose.activeMuscleGroup === 'legs' ? '#c2410c' : '#1d2230';
  drawTaperedLimb(pose.hipR, pose.kneeR, 11.5 * scale, 8.4 * scale, legColorTop, legColorBottom);
  drawTaperedLimb(pose.kneeR, pose.ankleR, 8.4 * scale, 5.4 * scale, '#e0ac8b', '#c99170');
  drawJointDisc(pose.hipR, 9.5 * scale, legColorTop);
  drawJointDisc(pose.kneeR, 7.8 * scale, legColorBottom);

  // Sport-Tech Sneakers on Ankles
  for (const ank of [pose.ankleL, pose.ankleR]) {
    const aPx = px(ank);
    ctx.fillStyle = '#ff6b1a';
    ctx.beginPath();
    ctx.roundRect(aPx.x - 5.5 * scale, aPx.y - 3 * scale, 15.5 * scale, 7.5 * scale, 3.8 * scale);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(aPx.x - 5 * scale, aPx.y + 2.4 * scale, 14.5 * scale, 2 * scale, 1 * scale);
    ctx.fill();
  }

  // Resistance loop band for single_leg_rdl
  if (equipment === 'resistance_cones') {
    const kLPx = px(pose.kneeL);
    const kRPx = px(pose.kneeR);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.moveTo(kLPx.x, kLPx.y);
    ctx.lineTo(kRPx.x, kRPx.y);
    ctx.stroke();
  }

  // Near Arm + seamless shoulder/elbow/wrist caps
  drawTaperedLimb(
    pose.shoulderR,
    pose.elbowR,
    8 * scale,
    6.2 * scale,
    pose.activeMuscleGroup === 'upper' ? '#ebb99a' : '#deb08e',
    '#c7906f'
  );
  drawTaperedLimb(pose.elbowR, pose.handR, 6.2 * scale, 4.6 * scale, '#deb08e', '#c7906f');
  drawJointDisc(pose.shoulderR, 7.2 * scale, pose.activeMuscleGroup === 'upper' ? '#ff6b1a' : '#2d3446');
  drawJointDisc(pose.elbowR, 6 * scale, '#d6a382');
  drawJointDisc(pose.handR, 4.8 * scale, '#deb08e');

  // Foreground Hand-held Workout Equipment (Dumbbells / Goblet / Boxing Gloves)
  const hRPx = px(pose.handR);
  if (equipment === 'dumbbells' || equipment === 'bench_dumbbell') {
    drawDumbbell2D(ctx, hRPx.x, hRPx.y, scale * 1.0, false);
  } else if (equipment === 'goblet_dumbbell') {
    const midX = (hLPx.x + hRPx.x) / 2;
    const midY = (hLPx.y + hRPx.y) / 2;
    drawDumbbell2D(ctx, midX, midY, scale * 1.15, true);
  } else if (equipment === 'boxing_bag') {
    ctx.fillStyle = '#ef4444';
    ctx.strokeStyle = '#fef2f2';
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.arc(hRPx.x, hRPx.y, 11 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Subtle Biomechanical Joint Telemetry Rings
  const keyJoints = [pose.hipCenter, pose.kneeR, pose.shoulderR];
  for (const j of keyJoints) {
    const p = px(j);
    ctx.fillStyle = playing ? 'rgba(255, 138, 61, 0.9)' : 'rgba(148, 163, 184, 0.6)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.8 * scale, 0, Math.PI * 2);
    ctx.fill();
  }
}
