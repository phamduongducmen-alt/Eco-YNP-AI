import type { AthletePoseFrame, Joint2D } from './kinematicMotion';

export interface Joint3D {
  x: number;
  y: number;
  z: number;
}

export interface AthletePose3D {
  head: Joint3D;
  neck: Joint3D;
  torsoCenter: Joint3D;
  pelvisCenter: Joint3D;
  shoulderL: Joint3D;
  shoulderR: Joint3D;
  elbowL: Joint3D;
  elbowR: Joint3D;
  handL: Joint3D;
  handR: Joint3D;
  hipL: Joint3D;
  hipR: Joint3D;
  kneeL: Joint3D;
  kneeR: Joint3D;
  ankleL: Joint3D;
  ankleR: Joint3D;
  facingFrontal: boolean;
}

const WORLD_SCALE = 3.6;

function toWorldBase(j: Joint2D, z: number): Joint3D {
  return {
    x: (j.x - 0.5) * WORLD_SCALE,
    y: Math.max(0.05, (0.84 - j.y) * WORLD_SCALE),
    z,
  };
}

/**
 * Converts normalized 2D kinematic keypoints into volumetric 3D skeleton coordinates
 * with anatomical shoulder/hip lateral Z-depth so left and right limbs stand naturally apart.
 */
export function poseFrameTo3D(pose: AthletePoseFrame): AthletePose3D {
  const shoulderDx = Math.abs(pose.shoulderR.x - pose.shoulderL.x);
  const facingFrontal = shoulderDx >= 0.068;

  const shoulderDepth = facingFrontal ? 0.06 : 0.28;
  const elbowDepth = facingFrontal ? 0.08 : 0.31;
  const handDepth = facingFrontal ? 0.1 : 0.29;
  const hipDepth = facingFrontal ? 0.05 : 0.19;
  const legDepth = facingFrontal ? 0.06 : 0.21;

  const shoulderL = toWorldBase(pose.shoulderL, -shoulderDepth);
  const shoulderR = toWorldBase(pose.shoulderR, shoulderDepth);
  const elbowL = toWorldBase(pose.elbowL, -elbowDepth);
  const elbowR = toWorldBase(pose.elbowR, elbowDepth);
  const handL = toWorldBase(pose.handL, -handDepth);
  const handR = toWorldBase(pose.handR, handDepth);

  const hipL = toWorldBase(pose.hipL, -hipDepth);
  const hipR = toWorldBase(pose.hipR, hipDepth);
  const kneeL = toWorldBase(pose.kneeL, -legDepth);
  const kneeR = toWorldBase(pose.kneeR, legDepth);
  const ankleL = toWorldBase(pose.ankleL, -legDepth);
  const ankleR = toWorldBase(pose.ankleR, legDepth);

  const head = toWorldBase(pose.head, 0);
  const neck = toWorldBase(pose.neck, 0);
  const pelvisCenter = toWorldBase(pose.hipCenter, 0);
  const torsoCenter: Joint3D = {
    x: (shoulderL.x + shoulderR.x) * 0.5,
    y: (shoulderL.y + shoulderR.y) * 0.5,
    z: 0,
  };

  return {
    head,
    neck,
    torsoCenter,
    pelvisCenter,
    shoulderL,
    shoulderR,
    elbowL,
    elbowR,
    handL,
    handR,
    hipL,
    hipR,
    kneeL,
    kneeR,
    ankleL,
    ankleR,
    facingFrontal,
  };
}

export type LimbEndCapStyle = 'anatomical' | 'spherical' | 'tapered';

export interface EndCapDimensions {
  style: LimbEndCapStyle;
  scale: number;
  shoulderRadius: number;
  elbowRadius: number;
  handRadius: number;
  kneeRadius: number;
  ankleScale: number;
}

export interface MuscleHighlightMask {
  upper: boolean;
  core: boolean;
  spine: boolean;
  legs: boolean;
  cardio: boolean;
  labelVi: string;
}

export function clampEndCapScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.round(Math.max(0.6, Math.min(1.6, scale)) * 100) / 100;
}

export function computeEndCapDimensions(
  style: LimbEndCapStyle,
  rawScale: number
): EndCapDimensions {
  const scale = clampEndCapScale(rawScale);
  const styleFactor = style === 'spherical' ? 1.14 : style === 'tapered' ? 0.86 : 1.0;
  return {
    style,
    scale,
    shoulderRadius: Number((0.084 * scale * styleFactor).toFixed(4)),
    elbowRadius: Number((0.064 * scale * styleFactor).toFixed(4)),
    handRadius: Number((0.058 * scale * styleFactor).toFixed(4)),
    kneeRadius: Number((0.086 * scale * styleFactor).toFixed(4)),
    ankleScale: Number((scale * styleFactor).toFixed(3)),
  };
}

export function resolveMuscleHighlightMask(
  muscleGroup: AthletePoseFrame['activeMuscleGroup']
): MuscleHighlightMask {
  switch (muscleGroup) {
    case 'upper':
      return {
        upper: true,
        core: false,
        spine: false,
        legs: false,
        cardio: false,
        labelVi: 'Cơ Vai · Ngực · Bắp tay & Xô',
      };
    case 'legs':
      return {
        upper: false,
        core: false,
        spine: false,
        legs: true,
        cardio: false,
        labelVi: 'Cơ Đùi trước · Mông · Bắp chân',
      };
    case 'core':
      return {
        upper: false,
        core: true,
        spine: false,
        legs: false,
        cardio: false,
        labelVi: 'Cơ Bụng sâu · Cơ Lõi (Core)',
      };
    case 'spine':
      return {
        upper: false,
        core: false,
        spine: true,
        legs: false,
        cardio: false,
        labelVi: 'Cột sống · Cơ dựng lưng · Khớp háng',
      };
    case 'cardio':
    default:
      return {
        upper: true,
        core: true,
        spine: false,
        legs: true,
        cardio: true,
        labelVi: 'Toàn thân · Nhịp tim & Phối hợp',
      };
  }
}

export type AnatomicalLimbKind = 'torso' | 'upper_arm' | 'forearm' | 'thigh' | 'shin';

/**
 * Generates normalized [radius, yOffset] profile pairs in y ∈ [-0.5, 0.5]
 * for LatheGeometry sculpting of anatomical muscle bellies.
 */
export function createAnatomicalProfilePoints(
  kind: AnatomicalLimbKind
): Array<{ r: number; y: number }> {
  switch (kind) {
    case 'torso':
      return [
        { r: 0.145, y: -0.5 },
        { r: 0.162, y: -0.25 },
        { r: 0.172, y: 0.0 },
        { r: 0.228, y: 0.28 },
        { r: 0.215, y: 0.46 },
        { r: 0.14, y: 0.5 },
      ];
    case 'upper_arm':
      return [
        { r: 0.056, y: -0.5 },
        { r: 0.068, y: -0.22 },
        { r: 0.084, y: 0.05 }, // Bicep/tricep belly peak
        { r: 0.082, y: 0.34 }, // Deltoid flare
        { r: 0.068, y: 0.5 },
      ];
    case 'forearm':
      return [
        { r: 0.036, y: -0.5 }, // Tapered wrist
        { r: 0.044, y: -0.18 },
        { r: 0.065, y: 0.22 }, // Brachioradialis bulge
        { r: 0.06, y: 0.5 },
      ];
    case 'thigh':
      return [
        { r: 0.078, y: -0.5 }, // Knee insertion
        { r: 0.098, y: -0.15 },
        { r: 0.124, y: 0.18 }, // Quad/hamstring peak
        { r: 0.118, y: 0.44 },
        { r: 0.096, y: 0.5 },
      ];
    case 'shin':
    default:
      return [
        { r: 0.046, y: -0.5 }, // Ankle tendon taper
        { r: 0.054, y: -0.16 },
        { r: 0.086, y: 0.22 }, // Gastrocnemius calf peak
        { r: 0.078, y: 0.46 },
        { r: 0.072, y: 0.5 },
      ];
  }
}

export function dampJoint3D(current: Joint3D, target: Joint3D, alpha: number): Joint3D {
  return {
    x: current.x + (target.x - current.x) * alpha,
    y: current.y + (target.y - current.y) * alpha,
    z: current.z + (target.z - current.z) * alpha,
  };
}

export function dampPose3D(current: AthletePose3D, target: AthletePose3D, alpha: number): AthletePose3D {
  return {
    head: dampJoint3D(current.head, target.head, alpha),
    neck: dampJoint3D(current.neck, target.neck, alpha),
    torsoCenter: dampJoint3D(current.torsoCenter, target.torsoCenter, alpha),
    pelvisCenter: dampJoint3D(current.pelvisCenter, target.pelvisCenter, alpha),
    shoulderL: dampJoint3D(current.shoulderL, target.shoulderL, alpha),
    shoulderR: dampJoint3D(current.shoulderR, target.shoulderR, alpha),
    elbowL: dampJoint3D(current.elbowL, target.elbowL, alpha),
    elbowR: dampJoint3D(current.elbowR, target.elbowR, alpha),
    handL: dampJoint3D(current.handL, target.handL, alpha),
    handR: dampJoint3D(current.handR, target.handR, alpha),
    hipL: dampJoint3D(current.hipL, target.hipL, alpha),
    hipR: dampJoint3D(current.hipR, target.hipR, alpha),
    kneeL: dampJoint3D(current.kneeL, target.kneeL, alpha),
    kneeR: dampJoint3D(current.kneeR, target.kneeR, alpha),
    ankleL: dampJoint3D(current.ankleL, target.ankleL, alpha),
    ankleR: dampJoint3D(current.ankleR, target.ankleR, alpha),
    facingFrontal: target.facingFrontal,
  };
}
