import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, Sparkles, Zap } from 'lucide-react';
import { soundEngine } from '../utils/soundEngine';

interface World3DExplorerProps {
  suitColor: string;
  visorColor: string;
  companionName: string;
  onCollectOrb: (totalCollected: number) => void;
}

const _vec3 = new THREE.Vector3();

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

export const World3DExplorer: React.FC<World3DExplorerProps> = ({
  suitColor,
  visorColor,
  companionName,
  onCollectOrb,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [gameState, setGameState] = useState<'title' | 'playing'>('title');
  const [collectedCount, setCollectedCount] = useState(0);
  const [totalItems, setTotalItems] = useState(10);
  const [waveNumber, setWaveNumber] = useState(1);
  const [sprintActive, setSprintActive] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  const keysRef = useRef<Record<string, boolean>>({});
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const onCollectOrbRef = useRef(onCollectOrb);
  onCollectOrbRef.current = onCollectOrb;
  const resetWorldFnRef = useRef<((advanceWave?: boolean) => void) | null>(null);
  const triggerJumpFnRef = useRef<(() => void) | null>(null);

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
      setWebglError('Thiết bị hiện tại chưa hỗ trợ WebGL 3D.');
      return;
    }

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 420;
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#cce7ff');
    scene.fog = new THREE.FogExp2('#cce7ff', 0.013);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 200);
    camera.position.set(0, 7.8, 13.5);

    // Warm key light + cool Hemisphere fill + subtle sky bounce
    const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x334155, 0.92);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.85);
    dirLight.position.set(14, 24, 12);
    dirLight.castShadow = !isSoftwareGl;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -28;
    dirLight.shadow.camera.right = 28;
    dirLight.shadow.camera.top = 28;
    dirLight.shadow.camera.bottom = -28;
    dirLight.shadow.bias = -0.0005;
    scene.add(dirLight);

    // Ground meadow + Central Plaza + Running Track Ring
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(52, 56),
      new THREE.MeshStandardMaterial({ color: 0x34d399, roughness: 0.88, metalness: 0.04 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const plaza = new THREE.Mesh(
      new THREE.CylinderGeometry(7.2, 7.8, 0.1, 36),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.72, metalness: 0.1 })
    );
    plaza.position.y = 0.05;
    plaza.receiveShadow = true;
    scene.add(plaza);

    const trackRing = new THREE.Mesh(
      new THREE.RingGeometry(11.4, 13.8, 56),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.85, metalness: 0.05 })
    );
    trackRing.rotation.x = -Math.PI / 2;
    trackRing.position.y = 0.025;
    scene.add(trackRing);

    // Pond & Wooden Pier Zone (East side)
    const pondGroup = new THREE.Group();
    const pondRim = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.7, 0.12, 28),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.78 })
    );
    pondRim.position.y = 0.06;
    const pondWater = new THREE.Mesh(
      new THREE.CylinderGeometry(3.9, 3.9, 0.14, 28),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.12, metalness: 0.35 })
    );
    pondWater.position.y = 0.07;
    const pier = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.16, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8 })
    );
    pier.position.set(-3.2, 0.14, 0);
    pondGroup.add(pondRim, pondWater, pier);
    pondGroup.position.set(16, 0, -4);
    scene.add(pondGroup);

    // Outdoor Gym Zone (West side) — Mat + 3D Kettlebell & Barbell Monument
    const gymZone = new THREE.Group();
    const gymMat = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.08, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 })
    );
    gymMat.position.y = 0.04;
    const rackPostL = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 2.4, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.75, roughness: 0.3 })
    );
    rackPostL.position.set(-1.3, 1.2, -1);
    const rackPostR = rackPostL.clone();
    rackPostR.position.set(1.3, 1.2, -1);
    const barbell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3.4, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.2 })
    );
    barbell.rotation.z = Math.PI / 2;
    barbell.position.set(0, 1.75, -1);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.45, metalness: 0.2 });
    const plateL = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.18, 20), plateMat);
    plateL.rotation.z = Math.PI / 2;
    plateL.position.set(-1.5, 1.75, -1);
    const plateR = plateL.clone();
    plateR.position.set(1.5, 1.75, -1);
    gymZone.add(gymMat, rackPostL, rackPostR, barbell, plateL, plateR);
    gymZone.position.set(-15, 0, -5);
    scene.add(gymZone);

    // Composite 8-part Articulated 3D Avatar + Orbiting Drone Companion
    const avatarGroup = new THREE.Group();
    const suitMat = new THREE.MeshStandardMaterial({ color: suitColor, roughness: 0.42, metalness: 0.18 });
    const visorMat = new THREE.MeshStandardMaterial({ color: visorColor, roughness: 0.16, metalness: 0.42 });
    const limbMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.12 });

    const bodyPivot = new THREE.Group();
    avatarGroup.add(bodyPivot);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.95, 16), suitMat);
    torso.position.y = 1.05;
    torso.castShadow = !isSoftwareGl;
    bodyPivot.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 16), suitMat);
    head.position.y = 1.82;
    head.castShadow = !isSoftwareGl;
    bodyPivot.add(head);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.22), visorMat);
    visor.position.set(0, 1.84, 0.28);
    bodyPivot.add(visor);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.56, 0.24), limbMat);
    pack.position.set(0, 1.1, -0.36);
    bodyPivot.add(pack);

    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.62, 10), limbMat);
    leftArm.position.set(-0.52, 1.12, 0);
    bodyPivot.add(leftArm);

    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.62, 10), limbMat);
    rightArm.position.set(0.52, 1.12, 0);
    bodyPivot.add(rightArm);

    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.58, 10), limbMat);
    leftLeg.position.set(-0.18, 0.3, 0);
    bodyPivot.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.11, 0.58, 10), limbMat);
    rightLeg.position.set(0.18, 0.3, 0);
    bodyPivot.add(rightLeg);

    // Orbiting AI Drone Companion
    const droneGroup = new THREE.Group();
    const droneCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 1), visorMat);
    const droneRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.035, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0xff6b1a, metalness: 0.7, roughness: 0.25 })
    );
    droneRing.rotation.x = Math.PI / 2;
    droneGroup.add(droneCore, droneRing);
    avatarGroup.add(droneGroup);

    const shadowDisc = new THREE.Mesh(
      new THREE.CircleGeometry(0.58, 20),
      new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.32, depthWrite: false })
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = 0.06;
    avatarGroup.add(shadowDisc);

    avatarGroup.position.set(0, 0.08, 0);
    scene.add(avatarGroup);

    // Trees & Central Monument Arch
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.7 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.65, metalness: 0.15 });

    const treePositions = [
      [-10, -10], [11, -11], [-14, 9], [13, 9], [0, -19], [-20, 1], [19, 3],
    ];
    treePositions.forEach(([tx, tz]) => {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.38, 2.2, 10), trunkMat);
      trunk.position.y = 1.1;
      const crown1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.4, 12), leafMat);
      crown1.position.y = 2.6;
      const crown2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.9, 12), leafMat);
      crown2.position.y = 3.8;
      tree.add(trunk, crown1, crown2);
      tree.position.set(tx, 0, tz);
      scene.add(tree);
    });

    const monument = new THREE.Group();
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.4, 0.9), stoneMat);
    pillarL.position.set(-2.4, 2.2, -13);
    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 4.4, 0.9), stoneMat);
    pillarR.position.set(2.4, 2.2, -13);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.8, 1.1), stoneMat);
    lintel.position.set(0, 4.6, -13);
    monument.add(pillarL, pillarR, lintel);
    scene.add(monument);

    // 3 Glowing Jump Booster Pads
    const jumpPads = [
      { x: 0, z: -7.5 },
      { x: -10, z: 1.5 },
      { x: 10, z: -1.5 },
    ];
    const padBaseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.5 });
    const padGlowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.75,
      roughness: 0.25,
    });
    jumpPads.forEach((jp) => {
      const padGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 0.14, 20), padBaseMat);
      base.position.y = 0.07;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.09, 10, 24), padGlowMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.16;
      padGroup.add(base, ring);
      padGroup.position.set(jp.x, 0, jp.z);
      scene.add(padGroup);
    });

    // Collectible Energy Orbs (8 ground + 2 high golden bonus rings near jump pads!)
    const orbLocations: Array<{ x: number; y: number; z: number; bonus: boolean }> = [
      { x: 4.5, y: 1.1, z: 4.5, bonus: false },
      { x: -5, y: 1.1, z: 4.5, bonus: false },
      { x: 8, y: 1.1, z: -4.5, bonus: false },
      { x: -8, y: 1.1, z: -5, bonus: false },
      { x: -14, y: 1.2, z: -2, bonus: false },
      { x: 14, y: 1.2, z: -3, bonus: false },
      { x: 0, y: 1.1, z: 11.5, bonus: false },
      { x: 0, y: 1.1, z: -12.5, bonus: false },
      { x: 0, y: 3.1, z: -7.5, bonus: true },
      { x: 10, y: 3.1, z: -1.5, bonus: true },
    ];
    const orbGeo = new THREE.OctahedronGeometry(0.52, 0);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.4,
      roughness: 0.2,
      metalness: 0.45,
    });
    const bonusRingGeo = new THREE.TorusGeometry(0.65, 0.14, 12, 24);
    const bonusRingMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
      roughness: 0.15,
      metalness: 0.7,
    });

    const orbs = orbLocations.map((loc) => {
      const mesh = new THREE.Mesh(
        loc.bonus ? bonusRingGeo : orbGeo,
        loc.bonus ? bonusRingMat : orbMat
      );
      mesh.position.set(loc.x, loc.y, loc.z);
      scene.add(mesh);
      return { mesh, baseX: loc.x, baseY: loc.y, baseZ: loc.z, bonus: loc.bonus, collected: false };
    });

    setTotalItems(orbs.length);

    let localCollected = 0;
    let playerVy = 0;
    let playerHeight = 0;

    resetWorldFnRef.current = (advanceWave = false) => {
      avatarGroup.position.set(0, 0.08, 0);
      avatarGroup.rotation.y = 0;
      playerVy = 0;
      playerHeight = 0;
      bodyPivot.position.y = 0;
      localCollected = 0;
      orbs.forEach((o) => {
        o.collected = false;
        o.mesh.visible = true;
      });
      setCollectedCount(0);
      if (advanceWave) {
        setWaveNumber((w) => w + 1);
      }
    };

    triggerJumpFnRef.current = () => {
      if (playerHeight <= 0.08) {
        playerVy = 7.4;
        soundEngine.playTone(440, 90, 'triangle', 0.06);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      if (e.code === 'Space' && gameStateRef.current === 'playing') {
        e.preventDefault();
        triggerJumpFnRef.current?.();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setSprintActive(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        setSprintActive(false);
      }
    };
    const handleBlur = () => {
      keysRef.current = {};
      setSprintActive(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 720;
      const h = container.clientHeight || 420;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const resizeObserver = new ResizeObserver(handleResize);
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
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const t = now * 0.0022;
      for (const orb of orbs) {
        if (!orb.collected) {
          orb.mesh.rotation.y += dt * (orb.bonus ? 2.6 : 1.8);
          orb.mesh.position.y = orb.baseY + Math.sin(t + orb.baseX) * 0.2;
        }
      }

      // Orbit companion drone continuously
      droneGroup.position.set(
        Math.cos(t * 1.4) * 1.05,
        2.05 + Math.sin(t * 2.2) * 0.16,
        Math.sin(t * 1.4) * 1.05
      );
      droneGroup.rotation.y = -t * 1.4;

      if (gameStateRef.current === 'title') {
        camera.position.x = Math.sin(now * 0.00035) * 15;
        camera.position.z = Math.cos(now * 0.00035) * 15;
        camera.position.y = 7.6;
        camera.lookAt(0, 1.4, -2);
      } else {
        const keys = keysRef.current;
        const moveX =
          (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) -
          (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);
        const moveZ =
          (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0) -
          (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0);
        const sprinting = Boolean(keys['ShiftLeft'] || keys['ShiftRight'] || keys['Sprint']);

        if (moveX !== 0 || moveZ !== 0) {
          const speed = sprinting ? 11.8 : 7.8;
          _vec3.set(moveX, 0, moveZ).normalize();
          avatarGroup.position.x = THREE.MathUtils.clamp(
            avatarGroup.position.x + _vec3.x * speed * dt,
            -24,
            24
          );
          avatarGroup.position.z = THREE.MathUtils.clamp(
            avatarGroup.position.z + _vec3.z * speed * dt,
            -24,
            24
          );
          avatarGroup.rotation.y = Math.atan2(_vec3.x, _vec3.z);
          const strideFreq = sprinting ? 0.022 : 0.015;
          leftLeg.rotation.x = Math.sin(now * strideFreq) * 0.55;
          rightLeg.rotation.x = -Math.sin(now * strideFreq) * 0.55;
          leftArm.rotation.x = -Math.sin(now * strideFreq) * 0.45;
          rightArm.rotation.x = Math.sin(now * strideFreq) * 0.45;
        } else {
          leftLeg.rotation.x = THREE.MathUtils.damp(leftLeg.rotation.x, 0, 10, dt);
          rightLeg.rotation.x = THREE.MathUtils.damp(rightLeg.rotation.x, 0, 10, dt);
          leftArm.rotation.x = THREE.MathUtils.damp(leftArm.rotation.x, 0, 10, dt);
          rightArm.rotation.x = THREE.MathUtils.damp(rightArm.rotation.x, 0, 10, dt);
        }

        // Check Jump Pads
        for (const jp of jumpPads) {
          const dx = avatarGroup.position.x - jp.x;
          const dz = avatarGroup.position.z - jp.z;
          if (dx * dx + dz * dz < 1.15 && playerHeight < 0.25 && playerVy <= 0.5) {
            playerVy = 10.2;
            soundEngine.playTone(660, 120, 'sine', 0.07);
          }
        }

        // Vertical Gravity & Jump Arc
        playerVy -= 21 * dt;
        playerHeight = Math.max(0, playerHeight + playerVy * dt);
        if (playerHeight === 0 && playerVy < 0) playerVy = 0;
        bodyPivot.position.y = playerHeight;
        const shadowScale = Math.max(0.45, 1 - playerHeight * 0.14);
        shadowDisc.scale.set(shadowScale, shadowScale, 1);

        // Check Orb & Aerial Ring Collection
        for (const orb of orbs) {
          if (!orb.collected) {
            const dx = avatarGroup.position.x - orb.mesh.position.x;
            const dz = avatarGroup.position.z - orb.mesh.position.z;
            const dy = playerHeight + 1.1 - orb.mesh.position.y;
            if (dx * dx + dz * dz < 1.75 && Math.abs(dy) < 1.7) {
              orb.collected = true;
              orb.mesh.visible = false;
              localCollected += 1;
              setCollectedCount(localCollected);
              soundEngine.playGameFeedback(orb.bonus ? 'win' : 'collect');
              onCollectOrbRef.current(localCollected);
            }
          }
        }

        // Smooth camera follow
        const camDamp = 1 - Math.exp(-6 * dt);
        camera.position.x = THREE.MathUtils.lerp(camera.position.x, avatarGroup.position.x, camDamp);
        camera.position.y = THREE.MathUtils.lerp(camera.position.y, 7.0 + playerHeight * 0.45, camDamp);
        camera.position.z = THREE.MathUtils.lerp(camera.position.z, avatarGroup.position.z + 11.2, camDamp);
        camera.lookAt(avatarGroup.position.x, 1.5 + playerHeight * 0.4, avatarGroup.position.z);
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [suitColor, visorColor]);

  const setVirtualKey = (code: string, pressed: boolean) => {
    keysRef.current[code] = pressed;
  };

  if (webglError) {
    return (
      <div className="flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-slate-100 p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        {webglError}
      </div>
    );
  }

  return (
    <div className="relative h-[430px] w-full overflow-hidden rounded-xl border border-slate-200 bg-sky-100 dark:border-zinc-800">
      <div ref={mountRef} className="h-full w-full" data-testid="three-world-canvas" />

      {/* Top HUD (no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex flex-wrap items-center justify-between gap-2">
        <div className="rounded-lg bg-slate-900/90 px-3.5 py-2 text-xs text-white">
          <span className="font-semibold text-[#FF6B1A]">Vòng {waveNumber}</span>
          <span className="mx-1.5 text-slate-400">·</span>
          <span className="font-semibold">{companionName} & Drone</span>
          <span className="mx-1.5 text-slate-400">·</span>
          <span className="font-mono tabular-nums">
            Ngọc & Vòng 3D: {collectedCount}/{totalItems}
          </span>
        </div>

        {gameState === 'playing' && (
          <div className="pointer-events-auto flex items-center gap-2">
            {collectedCount >= totalItems && (
              <button
                type="button"
                onClick={() => resetWorldFnRef.current?.(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#FF6B1A] px-3 py-2 text-xs font-bold text-zinc-950 hover:bg-[#ff7f38]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Chơi Vòng tiếp</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => resetWorldFnRef.current?.(false)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900/90 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Chơi lại</span>
            </button>
          </div>
        )}
      </div>

      {/* Title Overlay */}
      {gameState === 'title' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 p-6 text-center text-white">
          <h3 className="font-display text-2xl font-bold tracking-tight">
            Công viên Sức khỏe & Gym 3D NexaLife OS
          </h3>
          <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-200">
            Khám phá đường chạy, Khu Gym tạ ngoài trời, Hồ thư giãn cùng Drone {companionName}. Dùng WASD / Mũi tên, phím Space để Nhảy, Shift để Chạy nước rút, và dẫm lên Bệ bật Xanh để ăn Vòng thưởng trên không!
          </p>
          <button
            type="button"
            data-start="true"
            onClick={() => setGameState('playing')}
            className="mt-5 rounded-lg bg-[#FF6B1A] px-6 py-2.5 text-sm font-bold text-zinc-950 hover:bg-[#ff7f38]"
          >
            Bắt đầu Khám phá 3D
          </button>
        </div>
      )}

      {/* Touch / Mouse Controls + Jump & Sprint when Playing */}
      {gameState === 'playing' && (
        <>
          <div className="pointer-events-auto absolute bottom-4 left-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => triggerJumpFnRef.current?.()}
              className="rounded-lg bg-sky-500 px-3.5 py-2 text-xs font-bold text-slate-950 hover:bg-sky-400"
            >
              Nhảy (Space)
            </button>
            <button
              type="button"
              onPointerDown={() => {
                setVirtualKey('Sprint', true);
                setSprintActive(true);
              }}
              onPointerUp={() => {
                setVirtualKey('Sprint', false);
                setSprintActive(false);
              }}
              onPointerLeave={() => {
                setVirtualKey('Sprint', false);
                setSprintActive(false);
              }}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold ${
                sprintActive ? 'bg-[#FF6B1A] text-zinc-950' : 'bg-slate-900/85 text-white'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Chạy nhanh (Shift)</span>
            </button>
          </div>

          <div className="pointer-events-none absolute bottom-4 right-4 flex flex-col items-center gap-1">
            <button
              type="button"
              aria-label="Di chuyển lên"
              onPointerDown={() => setVirtualKey('ArrowUp', true)}
              onPointerUp={() => setVirtualKey('ArrowUp', false)}
              onPointerLeave={() => setVirtualKey('ArrowUp', false)}
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/85 text-white active:bg-[#FF6B1A]"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <div className="flex gap-1">
              <button
                type="button"
                aria-label="Di chuyển trái"
                onPointerDown={() => setVirtualKey('ArrowLeft', true)}
                onPointerUp={() => setVirtualKey('ArrowLeft', false)}
                onPointerLeave={() => setVirtualKey('ArrowLeft', false)}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/85 text-white active:bg-[#FF6B1A]"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Di chuyển xuống"
                onPointerDown={() => setVirtualKey('ArrowDown', true)}
                onPointerUp={() => setVirtualKey('ArrowDown', false)}
                onPointerLeave={() => setVirtualKey('ArrowDown', false)}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/85 text-white active:bg-[#FF6B1A]"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Di chuyển phải"
                onPointerDown={() => setVirtualKey('ArrowRight', true)}
                onPointerUp={() => setVirtualKey('ArrowRight', false)}
                onPointerLeave={() => setVirtualKey('ArrowRight', false)}
                className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900/85 text-white active:bg-[#FF6B1A]"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
