import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Activity,
  Camera,
  ChevronDown,
  ChevronUp,
  Dumbbell,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import type { ExerciseEquipmentProp, ExerciseItem } from '../types/lifeworld';
import {
  computeAthletePoseFrame,
  getEquipmentPropLabelVi,
} from '../utils/kinematicMotion';
import {
  clampEndCapScale,
  computeEndCapDimensions,
  createAnatomicalProfilePoints,
  dampPose3D,
  poseFrameTo3D,
  resolveMuscleHighlightMask,
  type AnatomicalLimbKind,
  type AthletePose3D,
  type Joint3D,
  type LimbEndCapStyle,
} from '../utils/kinematic3d';

interface Exercise3DStageProps {
  exerciseId: string;
  poseType: ExerciseItem['poseType'];
  equipmentProp: ExerciseEquipmentProp;
  breathCycleSec?: ExerciseItem['breathCycleSec'];
  playing: boolean;
  speed: number;
  elapsedSec: number;
  getLiveElapsedSec?: () => number;
  activeStepIndex: number;
}

type CameraPreset = 'three_quarter' | 'front' | 'side' | 'top';

const CAMERA_PRESETS: Record<CameraPreset, { label: string; yaw: number; pitch: number; dist: number }> = {
  three_quarter: { label: 'Góc 3/4', yaw: 0.42, pitch: 0.28, dist: 6.3 },
  front: { label: 'Chính diện', yaw: 0, pitch: 0.2, dist: 6.1 },
  side: { label: 'Bên hông', yaw: Math.PI / 2, pitch: 0.2, dist: 6.1 },
  top: { label: 'Trên cao', yaw: 0.3, pitch: 0.98, dist: 6.5 },
};

const END_CAP_STYLES: Array<{ id: LimbEndCapStyle; label: string }> = [
  { id: 'anatomical', label: 'Giải phẫu' },
  { id: 'spherical', label: 'Bi khớp' },
  { id: 'tapered', label: 'Thuôn' },
];

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createAnatomicalLatheGeometry(kind: AnatomicalLimbKind, radialSegments = 18): THREE.LatheGeometry {
  const pts = createAnatomicalProfilePoints(kind).map((p) => new THREE.Vector2(p.r, p.y));
  const geo = new THREE.LatheGeometry(pts, radialSegments);
  geo.computeVertexNormals();
  return geo;
}

function createFiberWeaveTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#272d3d';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(255, 138, 61, 0.14)';
    ctx.lineWidth = 1.5;
    for (let y = 0; y < 128; y += 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(128, y + (y % 16 === 0 ? 4 : -4));
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    for (let x = 0; x < 128; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 128);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 3);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createKnurledMetalTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.lineWidth = 1.2;
    for (let i = -128; i < 256; i += 8) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 128, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 128, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createSoccerBallTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#0f172a';
    const spots = [
      [32, 32],
      [96, 32],
      [160, 32],
      [224, 32],
      [64, 92],
      [128, 92],
      [192, 92],
    ];
    for (const [cx, cy] of spots) {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(ang) * 16;
        const py = cy + Math.sin(ang) * 16;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createDumbbell3D(scale: number, knurlTex: THREE.CanvasTexture): THREE.Group {
  const g = new THREE.Group();
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    map: knurlTex,
    metalness: 0.88,
    roughness: 0.24,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0x18181b,
    metalness: 0.25,
    roughness: 0.68,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xff6b1a,
    metalness: 0.55,
    roughness: 0.32,
  });

  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.028 * scale, 0.028 * scale, 0.38 * scale, 14),
    handleMat
  );
  bar.rotation.x = Math.PI / 2;

  // Inner & outer hexagonal weight plates with beveled rim look
  const plateLOuter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.115 * scale, 0.115 * scale, 0.052 * scale, 6),
    plateMat
  );
  plateLOuter.rotation.x = Math.PI / 2;
  plateLOuter.position.z = -0.155 * scale;

  const plateLInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095 * scale, 0.095 * scale, 0.036 * scale, 6),
    plateMat
  );
  plateLInner.rotation.x = Math.PI / 2;
  plateLInner.position.z = -0.115 * scale;

  const plateROuter = plateLOuter.clone();
  plateROuter.position.z = 0.155 * scale;
  const plateRInner = plateLInner.clone();
  plateRInner.position.z = 0.115 * scale;

  const collarL = new THREE.Mesh(
    new THREE.CylinderGeometry(0.048 * scale, 0.048 * scale, 0.024 * scale, 14),
    collarMat
  );
  collarL.rotation.x = Math.PI / 2;
  collarL.position.z = -0.09 * scale;

  const collarR = collarL.clone();
  collarR.position.z = 0.09 * scale;

  g.add(bar, plateLOuter, plateLInner, plateROuter, plateRInner, collarL, collarR);
  return g;
}

function createCone3D(): THREE.Group {
  const g = new THREE.Group();
  const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.48, metalness: 0.05 });
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.28), baseMat);
  base.position.y = 0.015;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 14), orangeMat);
  cone.position.y = 0.16;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.082, 0.055, 14), stripeMat);
  stripe.position.y = 0.15;
  g.add(base, cone, stripe);
  return g;
}

/** Builds a configurable multi-part limb end-cap (hand/wrist or athletic foot) */
function buildHandCapGroup(
  style: LimbEndCapStyle,
  skinMat: THREE.Material,
  jointAccentMat: THREE.Material,
  metalMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  if (style === 'anatomical') {
    const wristCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.042, 0.045, 12), jointAccentMat);
    wristCollar.position.y = -0.02;
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.095, 0.082), skinMat);
    palm.position.y = 0.035;
    const fingers = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.055, 6, 10), skinMat);
    fingers.rotation.x = Math.PI / 2;
    fingers.scale.set(0.95, 1, 0.72);
    fingers.position.set(0, 0.088, 0.008);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.035, 6, 8), skinMat);
    thumb.position.set(0.036, 0.03, 0.032);
    thumb.rotation.z = -0.45;
    g.add(wristCollar, palm, fingers, thumb);
  } else if (style === 'spherical') {
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.012, 8, 16), metalMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -0.022;
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.066, 16, 14), jointAccentMat);
    sphere.position.y = 0.028;
    g.add(collar, sphere);
  } else {
    // tapered aerodynamic cap
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.048, 0.135, 12), jointAccentMat);
    blade.position.y = 0.042;
    const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.038, 0.035, 12), metalMat);
    baseRing.position.y = -0.02;
    g.add(baseRing, blade);
  }
  return g;
}

function buildFootCapGroup(
  style: LimbEndCapStyle,
  shoeMat: THREE.Material,
  soleMat: THREE.Material,
  metalMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  if (style === 'anatomical') {
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.148, 0.026, 0.27), soleMat);
    sole.position.set(0, 0.013, 0.05);
    const heelCup = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.09, 12), shoeMat);
    heelCup.position.set(0, 0.062, -0.02);
    const forefoot = new THREE.Mesh(new THREE.CapsuleGeometry(0.064, 0.11, 6, 12), shoeMat);
    forefoot.rotation.x = Math.PI / 2;
    forefoot.scale.set(1.06, 1, 0.65);
    forefoot.position.set(0, 0.052, 0.085);
    const laceStrap = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.022, 0.08), metalMat);
    laceStrap.position.set(0, 0.085, 0.04);
    g.add(sole, heelCup, forefoot, laceStrap);
  } else if (style === 'spherical') {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 14), shoeMat);
    pod.position.set(0, 0.085, 0);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.03, 18), soleMat);
    disc.position.set(0, 0.015, 0);
    g.add(pod, disc);
  } else {
    const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.085, 0.25, 12), shoeMat);
    wedge.rotation.x = Math.PI / 2;
    wedge.position.set(0, 0.055, 0.05);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.24), soleMat);
    fin.position.set(0, 0.012, 0.05);
    g.add(wedge, fin);
  }
  return g;
}

// Pre-allocated math helpers (zero per-frame GC allocation)
const _upAxis = new THREE.Vector3(0, 1, 0);
const _p1 = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _armDir = new THREE.Vector3();
const _footFwd = new THREE.Vector3();
const _targetColor = new THREE.Color();

function alignAnatomicalSegment(
  mesh: THREE.Mesh,
  a: Joint3D,
  b: Joint3D,
  radialMultiplier = 1
) {
  _p1.set(a.x, a.y, a.z);
  _p2.set(b.x, b.y, b.z);
  _dir.subVectors(_p2, _p1);
  const len = _dir.length();
  if (len < 0.001) return;
  _mid.addVectors(_p1, _p2).multiplyScalar(0.5);
  mesh.position.copy(_mid);
  mesh.scale.set(radialMultiplier, len, radialMultiplier);
  mesh.quaternion.setFromUnitVectors(_upAxis, _dir.normalize());
}

export const Exercise3DStage: React.FC<Exercise3DStageProps> = ({
  exerciseId,
  poseType,
  equipmentProp,
  breathCycleSec,
  playing,
  speed,
  elapsedSec,
  getLiveElapsedSec,
  activeStepIndex,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [preset, setPreset] = useState<CameraPreset>('three_quarter');
  const [endCapStyle, setEndCapStyle] = useState<LimbEndCapStyle>('anatomical');
  const [endCapScale, setEndCapScale] = useState<number>(1.0);
  const [showMuscleFocus, setShowMuscleFocus] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [transitionNotice, setTransitionNotice] = useState(false);

  const initialFrame = useMemo(
    () => computeAthletePoseFrame(poseType, elapsedSec, activeStepIndex),
    [poseType, elapsedSec, activeStepIndex]
  );
  const activeMuscleInfo = useMemo(
    () => resolveMuscleHighlightMask(initialFrame.activeMuscleGroup),
    [initialFrame.activeMuscleGroup]
  );

  const propsRef = useRef({
    exerciseId,
    poseType,
    equipmentProp,
    breathCycleSec: breathCycleSec || { inhale: 4, hold: 1, exhale: 4 },
    playing,
    speed,
    elapsedSec,
    getLiveElapsedSec,
    activeStepIndex,
    endCapStyle,
    endCapScale,
    showMuscleFocus,
  });
  propsRef.current = {
    exerciseId,
    poseType,
    equipmentProp,
    breathCycleSec: breathCycleSec || { inhale: 4, hold: 1, exhale: 4 },
    playing,
    speed,
    elapsedSec,
    getLiveElapsedSec,
    activeStepIndex,
    endCapStyle,
    endCapScale,
    showMuscleFocus,
  };

  const orbitRef = useRef({
    yaw: CAMERA_PRESETS.three_quarter.yaw,
    pitch: CAMERA_PRESETS.three_quarter.pitch,
    dist: CAMERA_PRESETS.three_quarter.dist,
    targetYaw: CAMERA_PRESETS.three_quarter.yaw,
    targetPitch: CAMERA_PRESETS.three_quarter.pitch,
    targetDist: CAMERA_PRESETS.three_quarter.dist,
    dragging: false,
    lastX: 0,
    lastY: 0,
  });

  const pulseRef = useRef(0);
  const rebuildEquipmentFnRef = useRef<((eq: ExerciseEquipmentProp) => void) | null>(null);
  const rebuildEndCapsFnRef = useRef<((style: LimbEndCapStyle) => void) | null>(null);
  const currentPose3DRef = useRef<AthletePose3D>(
    poseFrameTo3D(computeAthletePoseFrame(poseType, elapsedSec, activeStepIndex))
  );

  // Trigger smooth 3D training transition pulse whenever exercise or step changes
  useEffect(() => {
    pulseRef.current = 1;
    setTransitionNotice(true);
    const id = window.setTimeout(() => setTransitionNotice(false), 650);
    return () => window.clearTimeout(id);
  }, [exerciseId, activeStepIndex]);

  useEffect(() => {
    rebuildEquipmentFnRef.current?.(equipmentProp);
  }, [equipmentProp]);

  useEffect(() => {
    rebuildEndCapsFnRef.current?.(endCapStyle);
  }, [endCapStyle]);

  // Keyboard shortcut 'H' to toggle HUD dock cleanly without obscuring viewport
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const selectPreset = (next: CameraPreset) => {
    setPreset(next);
    const cfg = CAMERA_PRESETS[next];
    orbitRef.current.targetYaw = cfg.yaw;
    orbitRef.current.targetPitch = cfg.pitch;
    orbitRef.current.targetDist = cfg.dist;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareGl();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglError('Thiết bị chưa hỗ trợ WebGL 3D. Vui lòng chuyển sang chế độ 2D Giải phẫu.');
      return;
    }

    const w = container.clientWidth || 640;
    const h = container.clientHeight || 360;
    renderer.setSize(w, h);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1);
    const fiberTexture = createFiberWeaveTexture(maxAnisotropy);
    const knurlTexture = createKnurledMetalTexture(maxAnisotropy);
    const soccerTexture = createSoccerBallTexture(maxAnisotropy);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090B10');
    scene.fog = new THREE.FogExp2('#090B10', 0.048);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 80);

    // Balanced 3-Point Studio Lighting: Cool Hemisphere Fill + Warm Key + Amber Rim
    const hemi = new THREE.HemisphereLight(0xe0f2fe, 0x1e293b, 0.9);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.05);
    keyLight.position.set(4.5, 7, 5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff6b1a, 1.25);
    rimLight.position.set(-4.5, 4, -4.5);
    scene.add(rimLight);

    // Circular Floor Platform + Calibration Grid
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x121620,
      roughness: 0.78,
      metalness: 0.12,
    });
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.14, 48), floorMat);
    platform.position.y = -0.07;
    platform.receiveShadow = true;
    scene.add(platform);

    const rimRing = new THREE.Mesh(
      new THREE.RingGeometry(2.65, 2.71, 48),
      new THREE.MeshBasicMaterial({ color: 0xff6b1a, transparent: true, opacity: 0.4, side: THREE.DoubleSide })
    );
    rimRing.rotation.x = -Math.PI / 2;
    rimRing.position.y = 0.008;
    scene.add(rimRing);

    const gridHelper = new THREE.GridHelper(14, 24, 0x272d3d, 0x171b24);
    gridHelper.position.y = -0.002;
    scene.add(gridHelper);

    const pulseRingMat = new THREE.MeshBasicMaterial({
      color: 0xff8a3d,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.56, 40), pulseRingMat);
    pulseRing.rotation.x = -Math.PI / 2;
    pulseRing.position.y = 0.014;
    scene.add(pulseRing);

    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 28),
      new THREE.MeshBasicMaterial({ color: 0x030407, transparent: true, opacity: 0.48, depthWrite: false })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.011;
    scene.add(contactShadow);

    // ================= 3D ANATOMICAL ATHLETE RIG =================
    const athleteGroup = new THREE.Group();
    scene.add(athleteGroup);

    // Independent muscle materials allow live anatomical activation highlighting
    const torsoMat = new THREE.MeshStandardMaterial({
      color: 0x293246,
      map: fiberTexture,
      roughness: 0.55,
      metalness: 0.1,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const upperLimbMat = new THREE.MeshStandardMaterial({
      color: 0xdca583,
      roughness: 0.52,
      metalness: 0.05,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const thighMat = new THREE.MeshStandardMaterial({
      color: 0x1c2231,
      map: fiberTexture,
      roughness: 0.65,
      metalness: 0.08,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const shinMat = new THREE.MeshStandardMaterial({
      color: 0xdca583,
      roughness: 0.52,
      metalness: 0.05,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const corePelvisMat = new THREE.MeshStandardMaterial({
      color: 0x181c26,
      roughness: 0.68,
      metalness: 0.08,
      emissive: new THREE.Color(0x000000),
      emissiveIntensity: 0,
    });
    const accentTankMat = new THREE.MeshStandardMaterial({
      color: 0xff6b1a,
      roughness: 0.36,
      metalness: 0.25,
      emissive: new THREE.Color(0xff6b1a),
      emissiveIntensity: 0.08,
    });
    const capMetalMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.85,
      roughness: 0.24,
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xdca583, roughness: 0.55, metalness: 0.04 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.4, metalness: 0.15 });
    const soleMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });

    const makeSculptedLimb = (kind: AnatomicalLimbKind, mat: THREE.Material) => {
      const m = new THREE.Mesh(createAnatomicalLatheGeometry(kind, 18), mat);
      m.castShadow = !isSoftwareGl;
      athleteGroup.add(m);
      return m;
    };

    // Torso, Neck & Head + Visor Headband + Spine Column Accent
    const torsoMesh = makeSculptedLimb('torso', torsoMat);
    const shoulderYoke = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.088, 1, 14), accentTankMat);
    shoulderYoke.castShadow = !isSoftwareGl;
    athleteGroup.add(shoulderYoke);

    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.078, 1, 14), skinMat);
    neckMesh.castShadow = !isSoftwareGl;
    athleteGroup.add(neckMesh);

    const headGroup = new THREE.Group();
    const headBall = new THREE.Mesh(new THREE.SphereGeometry(0.165, 20, 16), skinMat);
    headBall.scale.set(0.92, 1.06, 0.96);
    headBall.castShadow = !isSoftwareGl;
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.156, 0.021, 10, 24), accentTankMat);
    headband.rotation.x = Math.PI / 2 - 0.12;
    headband.position.y = 0.045;
    headGroup.add(headBall, headband);
    athleteGroup.add(headGroup);

    const pelvisBall = new THREE.Mesh(new THREE.SphereGeometry(0.172, 18, 14), corePelvisMat);
    pelvisBall.scale.set(1.12, 0.85, 0.88);
    pelvisBall.castShadow = !isSoftwareGl;
    athleteGroup.add(pelvisBall);

    // Sculpted Anatomical Arms & Legs
    const upperArmL = makeSculptedLimb('upper_arm', upperLimbMat);
    const forearmL = makeSculptedLimb('forearm', upperLimbMat);
    const upperArmR = makeSculptedLimb('upper_arm', upperLimbMat);
    const forearmR = makeSculptedLimb('forearm', upperLimbMat);

    const thighL = makeSculptedLimb('thigh', thighMat);
    const shinL = makeSculptedLimb('shin', shinMat);
    const thighR = makeSculptedLimb('thigh', thighMat);
    const shinR = makeSculptedLimb('shin', shinMat);

    // Adjustable Limb End-Caps & Articulated Joint Sockets
    const shoulderJointL = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14), accentTankMat);
    const shoulderJointR = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14), accentTankMat);
    const elbowJointL = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14), skinMat);
    const elbowJointR = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14), skinMat);
    const kneeJointL = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14), thighMat);
    const kneeJointR = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 14), thighMat);

    shoulderJointL.castShadow = !isSoftwareGl;
    shoulderJointR.castShadow = !isSoftwareGl;
    kneeJointL.castShadow = !isSoftwareGl;
    kneeJointR.castShadow = !isSoftwareGl;
    athleteGroup.add(
      shoulderJointL,
      shoulderJointR,
      elbowJointL,
      elbowJointR,
      kneeJointL,
      kneeJointR
    );

    const handCapL = new THREE.Group();
    const handCapR = new THREE.Group();
    const footCapL = new THREE.Group();
    const footCapR = new THREE.Group();
    athleteGroup.add(handCapL, handCapR, footCapL, footCapR);

    const clearGroupChildren = (grp: THREE.Group) => {
      while (grp.children.length > 0) {
        grp.remove(grp.children[0]);
      }
    };

    const rebuildEndCaps = (style: LimbEndCapStyle) => {
      clearGroupChildren(handCapL);
      clearGroupChildren(handCapR);
      clearGroupChildren(footCapL);
      clearGroupChildren(footCapR);

      const leftHand = buildHandCapGroup(style, skinMat, accentTankMat, capMetalMat);
      const rightHand = buildHandCapGroup(style, skinMat, accentTankMat, capMetalMat);
      rightHand.scale.x = -1; // mirror thumb anatomy
      handCapL.add(leftHand);
      handCapR.add(rightHand);

      footCapL.add(buildFootCapGroup(style, shoeMat, soleMat, capMetalMat));
      footCapR.add(buildFootCapGroup(style, shoeMat, soleMat, capMetalMat));
    };

    rebuildEndCaps(propsRef.current.endCapStyle);
    rebuildEndCapsFnRef.current = rebuildEndCaps;

    // ================= INTEGRATED GYM EQUIPMENT STAGE =================
    const equipmentGroup = new THREE.Group();
    scene.add(equipmentGroup);

    const handAttachmentL = new THREE.Group();
    const handAttachmentR = new THREE.Group();
    const sharedCenterProp = new THREE.Group();
    scene.add(handAttachmentL, handAttachmentR, sharedCenterProp);

    let boxingBagGroup: THREE.Group | null = null;
    let pullupBarGroup: THREE.Group | null = null;
    let parallettesGroup: THREE.Group | null = null;
    let bandMesh: THREE.Mesh | null = null;

    const buildEquipment = (eq: ExerciseEquipmentProp) => {
      clearGroupChildren(equipmentGroup);
      clearGroupChildren(handAttachmentL);
      clearGroupChildren(handAttachmentR);
      clearGroupChildren(sharedCenterProp);
      boxingBagGroup = null;
      pullupBarGroup = null;
      parallettesGroup = null;
      bandMesh = null;

      // Ground Surface (Mat, Turf, or Running Track)
      if (eq === 'soccer_ball' || eq === 'agility_ladder' || eq === 'resistance_cones') {
        const turf = new THREE.Mesh(
          new THREE.BoxGeometry(3.25, 0.03, 1.9),
          new THREE.MeshStandardMaterial({ color: 0x0d4a2e, roughness: 0.9, metalness: 0.02 })
        );
        turf.position.y = 0.015;
        turf.receiveShadow = true;
        equipmentGroup.add(turf);
      } else if (eq === 'running_track') {
        const track = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 0.03, 1.75),
          new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85, metalness: 0.05 })
        );
        track.position.y = 0.015;
        const laneLine1 = new THREE.Mesh(
          new THREE.BoxGeometry(3.35, 0.034, 0.03),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 })
        );
        laneLine1.position.set(0, 0.017, -0.45);
        const laneLine2 = laneLine1.clone();
        laneLine2.position.z = 0.45;
        equipmentGroup.add(track, laneLine1, laneLine2);
      } else {
        const mat = new THREE.Mesh(
          new THREE.BoxGeometry(2.75, 0.032, 1.34),
          new THREE.MeshStandardMaterial({ color: 0x1c202d, roughness: 0.82, metalness: 0.05 })
        );
        mat.position.y = 0.016;
        mat.receiveShadow = true;
        const trim = new THREE.Mesh(
          new THREE.BoxGeometry(2.79, 0.018, 1.38),
          new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.5 })
        );
        trim.position.y = 0.009;
        equipmentGroup.add(mat, trim);
      }

      if (eq === 'yoga_blocks') {
        const blockMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.72, metalness: 0.04 });
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.16, 0.18), blockMat);
        b1.position.set(0.9, 0.1, 0.32);
        const b2 = b1.clone();
        b2.position.set(-0.85, 0.1, -0.3);
        equipmentGroup.add(b1, b2);
      }

      if (eq === 'pullup_bar') {
        const rig = new THREE.Group();
        const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.25 });
        const gripMat = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.55, metalness: 0.12 });
        const pillarL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.75, 14), steelMat);
        pillarL.position.set(-0.95, 1.375, 0);
        const pillarR = pillarL.clone();
        pillarR.position.set(0.95, 1.375, 0);
        const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 2.05, 16), steelMat);
        topBar.rotation.z = Math.PI / 2;
        topBar.position.set(0, 2.68, 0);
        const gripL = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.044, 0.26, 14), gripMat);
        gripL.rotation.z = Math.PI / 2;
        gripL.position.set(-0.34, 2.68, 0);
        const gripR = gripL.clone();
        gripR.position.set(0.34, 2.68, 0);
        const footL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.74), steelMat);
        footL.position.set(-0.95, 0.025, 0);
        const footR = footL.clone();
        footR.position.set(0.95, 0.025, 0);
        rig.add(pillarL, pillarR, topBar, gripL, gripR, footL, footR);
        equipmentGroup.add(rig);
        pullupBarGroup = rig;
      }

      if (eq === 'parallettes') {
        const pGroup = new THREE.Group();
        const woodMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55, metalness: 0.08 });
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.45, metalness: 0.55 });
        for (const zOff of [-0.32, 0.32]) {
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.72, 14), woodMat);
          handle.rotation.z = Math.PI / 2;
          handle.position.set(0.28, 0.34, zOff);
          const legA = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.24), legMat);
          legA.position.set(-0.04, 0.17, zOff);
          const legB = legA.clone();
          legB.position.set(0.6, 0.17, zOff);
          pGroup.add(handle, legA, legB);
        }
        equipmentGroup.add(pGroup);
        parallettesGroup = pGroup;
      }

      if (eq === 'goblet_dumbbell') {
        const goblet = createDumbbell3D(1.2, knurlTexture);
        goblet.rotation.x = Math.PI / 2;
        sharedCenterProp.add(goblet);
      }

      if (eq === 'dumbbells') {
        handAttachmentL.add(createDumbbell3D(0.92, knurlTexture));
        handAttachmentR.add(createDumbbell3D(0.92, knurlTexture));
      }

      if (eq === 'bench_dumbbell') {
        const padMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.1 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.35, metalness: 0.72 });
        const pad = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.12, 0.48), padMat);
        pad.position.set(0, 0.66, -0.05);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(1.39, 0.03, 0.49), accentTankMat);
        trim.position.set(0, 0.61, -0.05);
        const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.38), frameMat);
        leg1.position.set(-0.5, 0.3, -0.05);
        const leg2 = leg1.clone();
        leg2.position.set(0.5, 0.3, -0.05);
        equipmentGroup.add(pad, trim, leg1, leg2);
        handAttachmentR.add(createDumbbell3D(1.06, knurlTexture));
      }

      if (eq === 'chair') {
        const chairMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.15 });
        const chromeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.25, metalness: 0.82 });
        const seat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.08, 0.52), chairMat);
        seat.position.set(-0.1, 0.85, 0);
        const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.68, 0.46), chairMat);
        back.position.set(-0.34, 1.22, 0);
        const headRest = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.28), accentTankMat);
        headRest.position.set(-0.35, 1.62, 0);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 12), chromeMat);
        stem.position.set(-0.1, 0.42, 0);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.05, 5), chromeMat);
        base.position.set(-0.1, 0.04, 0);
        equipmentGroup.add(seat, back, headRest, stem, base);
      }

      if (eq === 'soccer_ball') {
        const ball = new THREE.Mesh(
          new THREE.SphereGeometry(0.185, 22, 16),
          new THREE.MeshStandardMaterial({ map: soccerTexture, roughness: 0.45, metalness: 0.05 })
        );
        ball.position.set(0.95, 0.215, 0.35);
        const c1 = createCone3D();
        c1.position.set(-0.95, 0.02, 0.45);
        const c2 = createCone3D();
        c2.position.set(1.1, 0.02, -0.45);
        equipmentGroup.add(ball, c1, c2);
      }

      if (eq === 'agility_ladder') {
        const rungMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
        const railMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 });
        const railA = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.02, 0.03), railMat);
        railA.position.set(0, 0.04, -0.25);
        const railB = railA.clone();
        railB.position.z = 0.25;
        equipmentGroup.add(railA, railB);
        for (let i = -3; i <= 3; i++) {
          const rung = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.024, 0.52), rungMat);
          rung.position.set(i * 0.34, 0.042, 0);
          equipmentGroup.add(rung);
        }
        const c1 = createCone3D();
        c1.position.set(-1.25, 0.02, -0.45);
        const c2 = createCone3D();
        c2.position.set(1.25, 0.02, 0.45);
        equipmentGroup.add(c1, c2);
      }

      if (eq === 'resistance_cones') {
        const c1 = createCone3D();
        c1.position.set(-0.95, 0.02, 0.45);
        const c2 = createCone3D();
        c2.position.set(0.95, 0.02, -0.45);
        equipmentGroup.add(c1, c2);
        bandMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.015, 0.015, 1, 10),
          new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x0891b2, emissiveIntensity: 0.42 })
        );
        equipmentGroup.add(bandMesh);
      }

      if (eq === 'running_track') {
        const c1 = createCone3D();
        c1.position.set(-1.2, 0.02, 0.5);
        const c2 = createCone3D();
        c2.position.set(1.2, 0.02, -0.5);
        equipmentGroup.add(c1, c2);
      }

      if (eq === 'boxing_bag') {
        const stand = new THREE.Group();
        const postMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.78, roughness: 0.3 });
        const bagMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.42, metalness: 0.1 });
        const strapMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.42 });

        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.75, 14), postMat);
        post.position.set(1.38, 1.375, 0);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.07, 0.08), postMat);
        arm.position.set(1.12, 2.72, 0);

        const bagPivot = new THREE.Group();
        bagPivot.position.set(0.9, 2.68, 0);
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.48, 8), postMat);
        chain.position.y = -0.24;
        const bagBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.15, 20), bagMat);
        bagBody.position.y = -1.05;
        const bagTop = new THREE.Mesh(new THREE.SphereGeometry(0.22, 18, 12), bagMat);
        bagTop.position.y = -0.48;
        const bagStripe = new THREE.Mesh(new THREE.CylinderGeometry(0.226, 0.226, 0.14, 20), strapMat);
        bagStripe.position.y = -0.82;
        bagPivot.add(chain, bagBody, bagTop, bagStripe);
        boxingBagGroup = bagPivot;

        stand.add(post, arm, bagPivot);
        equipmentGroup.add(stand);

        const gloveMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.38, metalness: 0.1 });
        const cuffMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
        for (const attach of [handAttachmentL, handAttachmentR]) {
          const glove = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 14), gloveMat);
          glove.scale.set(1.1, 0.92, 0.95);
          const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.068, 0.08, 12), cuffMat);
          cuff.position.y = -0.08;
          attach.add(glove, cuff);
        }
      }
    };

    buildEquipment(propsRef.current.equipmentProp);
    rebuildEquipmentFnRef.current = buildEquipment;

    // Orbit Drag & Wheel Zoom
    const dom = renderer.domElement;
    const onPointerDown = (e: PointerEvent) => {
      orbitRef.current.dragging = true;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!orbitRef.current.dragging) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      orbitRef.current.targetYaw -= dx * 0.008;
      orbitRef.current.targetPitch = THREE.MathUtils.clamp(
        orbitRef.current.targetPitch + dy * 0.006,
        0.1,
        1.25
      );
    };
    const onPointerUp = () => {
      orbitRef.current.dragging = false;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      orbitRef.current.targetDist = THREE.MathUtils.clamp(
        orbitRef.current.targetDist + e.deltaY * 0.003,
        3.5,
        8.8
      );
    };
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      if (!container) return;
      const nw = container.clientWidth || 640;
      const nh = container.clientHeight || 360;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObserver.observe(container);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync && gl.deleteSync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      const {
        poseType: pType,
        equipmentProp: eqProp,
        breathCycleSec: bCycle,
        speed: pSpeed,
        elapsedSec: pSec,
        getLiveElapsedSec: getLiveSec,
        activeStepIndex: sIdx,
        endCapStyle: capStyle,
        endCapScale: capScale,
        showMuscleFocus: focusMuscles,
      } = propsRef.current;

      const liveSec = getLiveSec ? getLiveSec() : pSec;
      const targetFrame = computeAthletePoseFrame(pType, liveSec * pSpeed, sIdx);
      const targetPose3D = poseFrameTo3D(targetFrame);

      // Exponential frame-rate independent 60fps skeletal damping
      const dampAlpha = isSoftwareGl ? 0.65 : 1 - Math.exp(-12 * dt);
      const pose3D = dampPose3D(currentPose3DRef.current, targetPose3D, dampAlpha);
      currentPose3DRef.current = pose3D;

      // Sync Anatomical Muscle Activation Highlights
      const mask = resolveMuscleHighlightMask(targetFrame.activeMuscleGroup);
      const breathTotal = Math.max(4, bCycle.inhale + bCycle.hold + bCycle.exhale);
      const breathPos = liveSec % breathTotal;
      const chestExpand =
        breathPos < bCycle.inhale
          ? 1 + 0.045 * (breathPos / bCycle.inhale)
          : breathPos < bCycle.inhale + bCycle.hold
            ? 1.045
            : 1 + 0.045 * (1 - (breathPos - bCycle.inhale - bCycle.hold) / Math.max(1, bCycle.exhale));

      const glowScale = focusMuscles ? 0.42 + 0.18 * Math.sin(now * 0.005) : 0;
      const applyHighlight = (mat: THREE.MeshStandardMaterial, baseHex: number, active: boolean) => {
        if (focusMuscles && active) {
          _targetColor.setHex(0xff6b1a);
          mat.emissive.copy(_targetColor);
          mat.emissiveIntensity = glowScale;
        } else {
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
        }
        mat.color.setHex(baseHex);
      };

      applyHighlight(torsoMat, 0x293246, mask.upper || mask.spine || mask.cardio);
      applyHighlight(upperLimbMat, 0xdca583, mask.upper || mask.cardio);
      applyHighlight(corePelvisMat, 0x181c26, mask.core || mask.spine);
      applyHighlight(thighMat, 0x1c2231, mask.legs || mask.cardio);
      applyHighlight(shinMat, 0xdca583, mask.legs || mask.cardio);

      // Update Anatomical Segments (Lathe Sculpted Meshes)
      headGroup.position.set(pose3D.head.x, pose3D.head.y, pose3D.head.z);
      pelvisBall.position.set(pose3D.pelvisCenter.x, pose3D.pelvisCenter.y, pose3D.pelvisCenter.z);
      alignAnatomicalSegment(torsoMesh, pose3D.pelvisCenter, pose3D.torsoCenter, chestExpand);
      alignAnatomicalSegment(shoulderYoke, pose3D.shoulderL, pose3D.shoulderR, 1);
      alignAnatomicalSegment(neckMesh, pose3D.neck, pose3D.head, 1);

      alignAnatomicalSegment(upperArmL, pose3D.shoulderL, pose3D.elbowL, 1);
      alignAnatomicalSegment(forearmL, pose3D.elbowL, pose3D.handL, 1);
      alignAnatomicalSegment(upperArmR, pose3D.shoulderR, pose3D.elbowR, 1);
      alignAnatomicalSegment(forearmR, pose3D.elbowR, pose3D.handR, 1);

      alignAnatomicalSegment(thighL, pose3D.hipL, pose3D.kneeL, 1);
      alignAnatomicalSegment(shinL, pose3D.kneeL, pose3D.ankleL, 1);
      alignAnatomicalSegment(thighR, pose3D.hipR, pose3D.kneeR, 1);
      alignAnatomicalSegment(shinR, pose3D.kneeR, pose3D.ankleR, 1);

      // Apply Adjustable Limb End-Cap Dimensions
      const capDims = computeEndCapDimensions(capStyle, clampEndCapScale(capScale));
      shoulderJointL.scale.setScalar(capDims.shoulderRadius);
      shoulderJointR.scale.setScalar(capDims.shoulderRadius);
      elbowJointL.scale.setScalar(capDims.elbowRadius);
      elbowJointR.scale.setScalar(capDims.elbowRadius);
      kneeJointL.scale.setScalar(capDims.kneeRadius);
      kneeJointR.scale.setScalar(capDims.kneeRadius);

      shoulderJointL.position.set(pose3D.shoulderL.x, pose3D.shoulderL.y, pose3D.shoulderL.z);
      shoulderJointR.position.set(pose3D.shoulderR.x, pose3D.shoulderR.y, pose3D.shoulderR.z);
      elbowJointL.position.set(pose3D.elbowL.x, pose3D.elbowL.y, pose3D.elbowL.z);
      elbowJointR.position.set(pose3D.elbowR.x, pose3D.elbowR.y, pose3D.elbowR.z);
      kneeJointL.position.set(pose3D.kneeL.x, pose3D.kneeL.y, pose3D.kneeL.z);
      kneeJointR.position.set(pose3D.kneeR.x, pose3D.kneeR.y, pose3D.kneeR.z);

      // Orient Adjustable Hand End-Caps along Forearm Vector
      handCapL.position.set(pose3D.handL.x, pose3D.handL.y, pose3D.handL.z);
      handCapL.scale.setScalar(capDims.ankleScale);
      _armDir.set(
        pose3D.handL.x - pose3D.elbowL.x,
        pose3D.handL.y - pose3D.elbowL.y,
        pose3D.handL.z - pose3D.elbowL.z
      );
      if (_armDir.lengthSq() > 0.0001) {
        handCapL.quaternion.setFromUnitVectors(_upAxis, _armDir.normalize());
      }

      handCapR.position.set(pose3D.handR.x, pose3D.handR.y, pose3D.handR.z);
      handCapR.scale.setScalar(capDims.ankleScale);
      _armDir.set(
        pose3D.handR.x - pose3D.elbowR.x,
        pose3D.handR.y - pose3D.elbowR.y,
        pose3D.handR.z - pose3D.elbowR.z
      );
      if (_armDir.lengthSq() > 0.0001) {
        handCapR.quaternion.setFromUnitVectors(_upAxis, _armDir.normalize());
      }

      // Orient & Ground Adjustable Foot End-Caps
      footCapL.position.set(pose3D.ankleL.x, Math.max(0.015, pose3D.ankleL.y - 0.045), pose3D.ankleL.z);
      footCapL.scale.setScalar(capDims.ankleScale);
      _footFwd.set(
        pose3D.ankleL.x - pose3D.kneeL.x,
        0,
        pose3D.ankleL.z - pose3D.kneeL.z
      );
      footCapL.rotation.y = _footFwd.lengthSq() > 0.002 ? Math.atan2(_footFwd.x, _footFwd.z) * 0.45 : 0;

      footCapR.position.set(pose3D.ankleR.x, Math.max(0.015, pose3D.ankleR.y - 0.045), pose3D.ankleR.z);
      footCapR.scale.setScalar(capDims.ankleScale);
      _footFwd.set(
        pose3D.ankleR.x - pose3D.kneeR.x,
        0,
        pose3D.ankleR.z - pose3D.kneeR.z
      );
      footCapR.rotation.y = _footFwd.lengthSq() > 0.002 ? Math.atan2(_footFwd.x, _footFwd.z) * 0.45 : 0;

      // Grounded Contact Shadow follows pelvis
      contactShadow.position.x = pose3D.pelvisCenter.x;
      contactShadow.position.z = pose3D.pelvisCenter.z;

      // Sync Hand-held & Ground Equipment to Skeleton
      handAttachmentL.position.set(pose3D.handL.x, pose3D.handL.y, pose3D.handL.z);
      handAttachmentR.position.set(pose3D.handR.x, pose3D.handR.y, pose3D.handR.z);
      sharedCenterProp.position.set(
        (pose3D.handL.x + pose3D.handR.x) * 0.5,
        (pose3D.handL.y + pose3D.handR.y) * 0.5,
        (pose3D.handL.z + pose3D.handR.z) * 0.5
      );

      if (pullupBarGroup) {
        const barY = Math.min(pose3D.handL.y, pose3D.handR.y);
        pullupBarGroup.position.y = Math.max(0, barY - 2.68);
      }

      if (parallettesGroup) {
        const handMinY = Math.min(pose3D.handL.y, pose3D.handR.y);
        const scaleY = Math.max(0.65, handMinY / 0.34);
        parallettesGroup.scale.set(1, scaleY, 1);
      }

      if (bandMesh) {
        alignAnatomicalSegment(bandMesh, pose3D.kneeL, pose3D.kneeR, 1);
      }

      if (boxingBagGroup && eqProp === 'boxing_bag') {
        const punchExtend = Math.max(0, pose3D.handL.x - 0.45);
        boxingBagGroup.rotation.z = punchExtend * 0.48 + Math.sin(now * 0.004) * 0.04;
      }

      // Transition Ripple Ring Animation
      if (pulseRef.current > 0.01) {
        pulseRef.current = Math.max(0, pulseRef.current - dt * 1.9);
        const expand = 1 + (1 - pulseRef.current) * 3.4;
        pulseRing.scale.set(expand, expand, 1);
        pulseRingMat.opacity = pulseRef.current * 0.65;
      } else {
        pulseRingMat.opacity = 0;
      }

      // Camera Orbit Damping
      const orb = orbitRef.current;
      const camAlpha = isSoftwareGl ? 1 : 1 - Math.exp(-9 * dt);
      orb.yaw = THREE.MathUtils.lerp(orb.yaw, orb.targetYaw, camAlpha);
      orb.pitch = THREE.MathUtils.lerp(orb.pitch, orb.targetPitch, camAlpha);
      orb.dist = THREE.MathUtils.lerp(orb.dist, orb.targetDist, camAlpha);

      const lookY = 1.08;
      camera.position.set(
        Math.sin(orb.yaw) * Math.cos(orb.pitch) * orb.dist,
        lookY + Math.sin(orb.pitch) * orb.dist,
        Math.cos(orb.yaw) * Math.cos(orb.pitch) * orb.dist
      );
      camera.lookAt(0, lookY, 0);

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = window.requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      fiberTexture.dispose();
      knurlTexture.dispose();
      soccerTexture.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#090B10] p-6 text-center text-xs text-zinc-300">
        {webglError}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full select-none bg-[#090B10]">
      <div
        ref={mountRef}
        data-testid="fitness-3d-stage"
        className="h-full w-full cursor-grab active:cursor-grabbing"
      />

      {/* Compact Transition Notice (cleanly aligned at top-3 left-44 without overlapping Step status) */}
      {transitionNotice && (
        <div className="pointer-events-none absolute left-3.5 top-11 rounded-md border border-orange-500/50 bg-[#0A0B0E]/90 px-2 py-0.5 text-[10px] font-semibold text-orange-300">
          3D Morph Transition
        </div>
      )}

      {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion, no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute inset-x-2.5 bottom-2 flex flex-col items-center gap-1">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          aria-expanded={!dockCollapsed}
          className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-zinc-700/90 bg-[#0A0B0E]/92 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300 hover:border-orange-500/60 hover:text-white"
        >
          {dockCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>{dockCollapsed ? 'Hiện bảng điều khiển 3D (H)' : 'Thu gọn (H)'}</span>
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full rounded-xl border border-zinc-700/90 bg-[#0A0B0E]/95 px-2.5 py-1.5 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              {/* Equipment & Active Muscle Toggle */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#13151C] px-2 py-0.5 text-[10px] font-medium text-zinc-200">
                  <Dumbbell className="h-3 w-3 text-[#FF6B1A] shrink-0" />
                  <span className="truncate max-w-[155px]">{getEquipmentPropLabelVi(equipmentProp)}</span>
                </span>

                <button
                  type="button"
                  onClick={() => setShowMuscleFocus((v) => !v)}
                  title={activeMuscleInfo.labelVi}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                    showMuscleFocus
                      ? 'bg-orange-500/20 text-orange-300 border border-orange-500/50'
                      : 'border border-zinc-800 bg-[#13151C] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Activity className="h-3 w-3 shrink-0" />
                  <span>Cơ: {activeMuscleInfo.labelVi.split('·')[0].trim()}</span>
                </button>
              </div>

              {/* Camera Presets */}
              <div className="flex items-center gap-0.5 rounded-lg border border-zinc-800 bg-[#13151C] p-0.5">
                <Camera className="mx-1 h-3 w-3 text-zinc-400 shrink-0" />
                {(Object.keys(CAMERA_PRESETS) as CameraPreset[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectPreset(key)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                      preset === key
                        ? 'bg-[#FF6B1A] text-zinc-950'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    {CAMERA_PRESETS[key].label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => selectPreset('three_quarter')}
                  aria-label="Đặt lại góc nhìn 3D"
                  className="rounded p-0.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Adjustable Limb End-Caps Strip */}
            <div className="mt-1 flex flex-wrap items-center justify-between gap-1.5 border-t border-zinc-800/80 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-zinc-400">
                  <SlidersHorizontal className="h-3 w-3 text-[#FF6B1A] shrink-0" />
                  <span>Đầu khớp chi:</span>
                </span>
                <div className="inline-flex rounded-md border border-zinc-800 bg-[#13151C] p-0.5">
                  {END_CAP_STYLES.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEndCapStyle(opt.id)}
                      className={`rounded px-2 py-0.5 text-[10px] font-semibold transition-colors whitespace-nowrap ${
                        endCapStyle === opt.id
                          ? 'bg-[#FF6B1A] text-zinc-950'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                <span className="text-zinc-400 whitespace-nowrap">Cỡ đầu chi:</span>
                <input
                  type="range"
                  aria-label="Điều chỉnh kích thước đầu khớp chi 3D"
                  min={0.6}
                  max={1.6}
                  step={0.05}
                  value={endCapScale}
                  onChange={(e) => setEndCapScale(clampEndCapScale(Number(e.target.value)))}
                  className="h-1.5 w-24 accent-[#FF6B1A] cursor-pointer"
                />
                <span className="w-8 font-mono text-[10px] font-semibold text-orange-300 tabular-nums text-right">
                  {endCapScale.toFixed(2)}x
                </span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
