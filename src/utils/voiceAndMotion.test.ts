import assert from 'node:assert/strict';
import test from 'node:test';
import { EXERCISE_LIBRARY } from '../data/exercises';
import { GLOBAL_LANGUAGES } from '../data/languages';
import { AI_COUNTRY_VOICES, getCountryVoiceProfile, getVoicePersonaSpec } from '../data/voices';
import {
  clampEndCapScale,
  computeEndCapDimensions,
  createAnatomicalProfilePoints,
  dampPose3D,
  poseFrameTo3D,
  resolveMuscleHighlightMask,
} from './kinematic3d';
import {
  blendAthletePoseFrames,
  computeAthletePoseFrame,
  getEquipmentPropLabelVi,
  getExerciseEquipmentProp,
} from './kinematicMotion';
import {
  buildCountrySpeechStyle,
  isRiffWavBase64,
  pcm16ToWavBase64,
  pickBestBrowserVoice,
} from './voiceEngine';

test('Every global language + Vietnam has dedicated female and male AI voice personas', () => {
  for (const lang of GLOBAL_LANGUAGES) {
    const profile = AI_COUNTRY_VOICES.find((v) => v.languageCode === lang.code);
    assert.ok(profile, `Missing AI voice profile for language ${lang.code}`);
    assert.ok(profile.female.personaName.length > 0);
    assert.ok(profile.male.personaName.length > 0);
    assert.notEqual(
      profile.female.geminiVoice,
      profile.male.geminiVoice,
      `Female and male Gemini prebuilt voices should differ for ${lang.code}`
    );
    assert.ok(profile.female.pitch > profile.male.pitch);
  }

  const vnFemale = getVoicePersonaSpec('vi', 'female');
  const vnMale = getVoicePersonaSpec('vi', 'male');
  assert.equal(getCountryVoiceProfile('vi').countryVi, 'Việt Nam');
  assert.ok(vnFemale.geminiVoice === 'Kore' || vnFemale.geminiVoice === 'Zephyr');
  assert.ok(vnMale.geminiVoice === 'Fenrir' || vnMale.geminiVoice === 'Charon' || vnMale.geminiVoice === 'Puck');
});

test('pickBestBrowserVoice selects male vs female voices cleanly across Vietnamese and foreign locales', () => {
  const mockVoices = [
    { name: 'Microsoft HoaiMy Online - Vietnamese (Vietnam)', lang: 'vi-VN' },
    { name: 'Microsoft NamMinh Online - Vietnamese (Vietnam)', lang: 'vi-VN' },
    { name: 'Google US English Samantha Female', lang: 'en-US' },
    { name: 'Google UK English Daniel Male', lang: 'en-GB' },
    { name: 'Kyoko', lang: 'ja-JP' },
    { name: 'Otoya', lang: 'ja-JP' },
  ];

  const viFemale = pickBestBrowserVoice(mockVoices, 'vi-VN', 'female', 'vi');
  assert.equal(viFemale.voice?.name.includes('HoaiMy'), true);
  assert.equal(viFemale.matchedGenderExplicitly, true);

  const viMale = pickBestBrowserVoice(mockVoices, 'vi-VN', 'male', 'vi');
  assert.equal(viMale.voice?.name.includes('NamMinh'), true);
  assert.equal(viMale.matchedGenderExplicitly, true);

  const jaFemale = pickBestBrowserVoice(mockVoices, 'ja-JP', 'female', 'ja');
  assert.equal(jaFemale.voice?.name, 'Kyoko');

  const jaMale = pickBestBrowserVoice(mockVoices, 'ja-JP', 'male', 'ja');
  assert.equal(jaMale.voice?.name, 'Otoya');
});

test('pcm16ToWavBase64 wraps raw PCM cleanly with RIFF WAVE header', () => {
  const samplePcm = Buffer.from([0, 0, 12, 0, 24, 0, 0, 0]).toString('base64');
  const wavBase64 = pcm16ToWavBase64(samplePcm, 24000);
  assert.equal(isRiffWavBase64(wavBase64), true);

  const bytes = Buffer.from(wavBase64, 'base64');
  assert.equal(bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(bytes.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.equal(bytes.length, 44 + 8);
});

test('buildCountrySpeechStyle reflects Vietnamese region and training/language style', () => {
  const southStyle = buildCountrySpeechStyle({
    languageCode: 'vi',
    gender: 'male',
    styleContext: 'fitness',
    vietnameseRegion: 'south',
  });
  assert.ok(southStyle.includes('Southern Vietnamese'));
  assert.ok(southStyle.includes('fitness trainer'));
});

test('computeAthletePoseFrame generates valid bounded normalized joint coordinates for all pose types', () => {
  const poseTypes = [
    'sun_salutation',
    'plank',
    'squat',
    'pushup',
    'bridge',
    'stretch',
    'cardio_jump',
    'warrior',
    'pullup_row',
    'agility_drill',
    'gym_press',
    'boxing_guard',
    'lunge_twist',
  ] as const;

  for (const poseType of poseTypes) {
    const f0 = computeAthletePoseFrame(poseType, 0);
    const fMid = computeAthletePoseFrame(poseType, 2.1);
    assert.ok(Number.isFinite(f0.head.x) && Number.isFinite(f0.head.y));
    assert.ok(Number.isFinite(fMid.hipCenter.x) && Number.isFinite(fMid.kneeR.y));
    assert.ok(fMid.ankleL.y >= 0.7 && fMid.ankleL.y <= 0.9);
    assert.ok(fMid.head.y >= 0.12 && fMid.head.y <= 0.86);
    assert.ok(fMid.handL.x >= 0.12 && fMid.handR.x <= 0.88);
  }
});

test('computeAthletePoseFrame supports all 7 newly added poses with step-aware biomechanics', () => {
  const newPoseTypes = [
    'pigeon_pose',
    'pike_dips',
    'l_sit',
    'dumbbell_row',
    'single_leg_rdl',
    'running_stride',
    'seated_posture',
  ] as const;

  for (const poseType of newPoseTypes) {
    for (const stepIdx of [0, 1, 2]) {
      const f = computeAthletePoseFrame(poseType, 1.35, stepIdx);
      const joints = [
        f.head,
        f.neck,
        f.shoulderL,
        f.shoulderR,
        f.elbowL,
        f.elbowR,
        f.handL,
        f.handR,
        f.hipCenter,
        f.hipL,
        f.hipR,
        f.kneeL,
        f.kneeR,
        f.ankleL,
        f.ankleR,
      ];
      for (const j of joints) {
        assert.ok(Number.isFinite(j.x) && Number.isFinite(j.y), `Non-finite joint in ${poseType}`);
        assert.ok(j.x >= 0.08 && j.x <= 0.92, `Out-of-bounds x=${j.x} in ${poseType}`);
        assert.ok(j.y >= 0.08 && j.y <= 0.92, `Out-of-bounds y=${j.y} in ${poseType}`);
      }
    }
  }

  // Verify L-sit raises feet clearly off the ground compared to standing poses
  const lsitFrame = computeAthletePoseFrame('l_sit', 1.8, 1);
  assert.ok(lsitFrame.ankleL.y < 0.75, 'L-sit should elevate legs off the floor');
});

test('Every exercise in EXERCISE_LIBRARY resolves to valid equipment props and Vietnamese labels', () => {
  assert.ok(EXERCISE_LIBRARY.length >= 21);
  for (const ex of EXERCISE_LIBRARY) {
    const prop = getExerciseEquipmentProp(ex);
    const label = getEquipmentPropLabelVi(prop);
    assert.ok(prop.length > 0, `Missing equipmentProp for ${ex.id}`);
    assert.ok(label.length > 4, `Missing equipment label for ${ex.id}`);
  }
});

test('poseFrameTo3D and dampPose3D build balanced 3D skeletons and interpolate smoothly', () => {
  const squat3D = poseFrameTo3D(computeAthletePoseFrame('squat', 0.4));
  const row3D = poseFrameTo3D(computeAthletePoseFrame('dumbbell_row', 1.2));

  assert.equal(squat3D.facingFrontal, true);
  assert.equal(row3D.facingFrontal, false);
  assert.ok(squat3D.shoulderL.z < 0 && squat3D.shoulderR.z > 0);
  assert.ok(row3D.elbowL.z < 0 && row3D.elbowR.z > 0);

  const mid = dampPose3D(squat3D, row3D, 0.5);
  assert.ok(Math.abs(mid.head.y - (squat3D.head.y + row3D.head.y) * 0.5) < 1e-6);
  assert.ok(Math.abs(mid.handL.x - (squat3D.handL.x + row3D.handL.x) * 0.5) < 1e-6);
});

test('blendAthletePoseFrames interpolates smoothly and clamps alpha safely', () => {
  const a = computeAthletePoseFrame('squat', 0);
  const b = computeAthletePoseFrame('lunge_twist', 1.5);
  const start = blendAthletePoseFrames(a, b, -0.5);
  const end = blendAthletePoseFrames(a, b, 1.5);
  const mid = blendAthletePoseFrames(a, b, 0.5);

  assert.equal(start.head.x, a.head.x);
  assert.equal(end.head.x, b.head.x);
  assert.equal(end.poseLabel, b.poseLabel);
  assert.ok(Number.isFinite(mid.hipCenter.x) && Number.isFinite(mid.kneeR.y));
  assert.notEqual(mid.head.y, a.head.y);
});

test('clampEndCapScale and computeEndCapDimensions scale limb end-caps predictably across styles', () => {
  assert.equal(clampEndCapScale(0.1), 0.6);
  assert.equal(clampEndCapScale(2.5), 1.6);
  assert.equal(clampEndCapScale(Number.NaN), 1);
  assert.equal(clampEndCapScale(1.25), 1.25);

  const anatomical = computeEndCapDimensions('anatomical', 1);
  const spherical = computeEndCapDimensions('spherical', 1.4);
  const tapered = computeEndCapDimensions('tapered', 0.8);

  assert.ok(spherical.handRadius > anatomical.handRadius);
  assert.ok(tapered.kneeRadius < anatomical.kneeRadius);
  assert.ok(anatomical.ankleScale === 1);
});

test('resolveMuscleHighlightMask and createAnatomicalProfilePoints cover all muscle groups and limb contours', () => {
  const upperMask = resolveMuscleHighlightMask('upper');
  assert.equal(upperMask.upper, true);
  assert.equal(upperMask.legs, false);
  assert.ok(upperMask.labelVi.length > 0);

  const cardioMask = resolveMuscleHighlightMask('cardio');
  assert.equal(cardioMask.upper && cardioMask.legs && cardioMask.core, true);

  for (const kind of ['torso', 'upper_arm', 'forearm', 'thigh', 'shin'] as const) {
    const pts = createAnatomicalProfilePoints(kind);
    assert.ok(pts.length >= 4);
    assert.equal(pts[0].y, -0.5);
    assert.equal(pts[pts.length - 1].y, 0.5);
    for (const pt of pts) {
      assert.ok(pt.r > 0 && Number.isFinite(pt.r));
    }
  }
});
