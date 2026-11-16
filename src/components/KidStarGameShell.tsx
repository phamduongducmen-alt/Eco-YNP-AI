import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Heart,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  generateKidChallengeWave,
  type KidChallengeMode,
  type KidChallengeWave,
} from '../utils/gameEngine';
import { soundEngine } from '../utils/soundEngine';

export interface KidStarRoundResult {
  score: number;
  xpEarned: number;
  starsCaught: number;
  accuracyPct: number;
}

interface KidStarGameShellProps {
  open: boolean;
  bestScore: number;
  companionName: string;
  suitColor: string;
  onClose: () => void;
  onFinishRound: (result: KidStarRoundResult) => void;
}

type ShellPhase = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'GAME_OVER';

interface FallingStarEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  label: string;
  isCorrect: boolean;
  isBonus?: boolean;
  rotation: number;
  rotSpeed: number;
  pulsePhase: number;
  active: boolean;
}

interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  active: boolean;
}

interface FloatingPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

const TOTAL_WAVES = 12;
const MAX_PARTICLES = 90;

function drawFivePointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  rotation: number
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.restore();
}

export const KidStarGameShell: React.FC<KidStarGameShellProps> = ({
  open,
  bestScore,
  companionName,
  suitColor,
  onClose,
  onFinishRound,
}) => {
  const [phase, setPhase] = useState<ShellPhase>('TITLE_MENU');
  const [mode, setMode] = useState<KidChallengeMode>('mix');
  const [muted, setMuted] = useState(false);

  // React HUD snapshot updated only on meaningful discrete events (not every frame)
  const [hud, setHud] = useState({
    score: 0,
    lives: 3,
    combo: 0,
    wave: 1,
    starsCaught: 0,
    attempts: 0,
    promptText: 'Chuẩn bị hứng sao!',
    hintText: '',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bgFailed, setBgFailed] = useState(false);

  // Mutable simulation state isolated from React re-renders
  const phaseRef = useRef<ShellPhase>('TITLE_MENU');
  const modeRef = useRef<KidChallengeMode>('mix');
  const mutedRef = useRef(false);
  const rewardReportedRef = useRef(false);

  const keysRef = useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const touchDirRef = useRef<-1 | 0 | 1>(0);
  const dashBufferRef = useRef(0);

  const simRef = useRef({
    width: 960,
    height: 600,
    playerX: 480,
    playerVx: 0,
    squashX: 1,
    squashY: 1,
    dashCooldown: 0,
    dashTimer: 0,
    hurtFlash: 0,
    hitstopTimer: 0,
    shakeMag: 0,
    score: 0,
    lives: 3,
    combo: 0,
    waveIndex: 1,
    starsCaught: 0,
    attempts: 0,
    currentWave: null as KidChallengeWave | null,
    stars: [] as FallingStarEntity[],
    particles: Array.from({ length: MAX_PARTICLES }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 0.5,
      size: 4,
      color: '#fde047',
      active: false,
    })) as ParticleEntity[],
    popups: [] as FloatingPopup[],
    twinkles: Array.from({ length: 40 }, (_, i) => ({
      rx: ((i * 73) % 997) / 997,
      ry: ((i * 313) % 701) / 1000,
      r: 1 + (i % 3) * 0.7,
      phase: i * 0.6,
    })),
  });

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const spawnBurst = useCallback((x: number, y: number, color: string, count = 18) => {
    const pool = simRef.current.particles;
    let spawned = 0;
    for (let i = 0; i < pool.length && spawned < count; i++) {
      if (!pool[i].active) {
        const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.35;
        const speed = 90 + Math.random() * 210;
        pool[i].active = true;
        pool[i].x = x;
        pool[i].y = y;
        pool[i].vx = Math.cos(angle) * speed;
        pool[i].vy = Math.sin(angle) * speed - 40;
        pool[i].maxLife = 0.42 + Math.random() * 0.28;
        pool[i].life = pool[i].maxLife;
        pool[i].size = 3.2 + Math.random() * 3.8;
        pool[i].color = color;
        spawned++;
      }
    }
  }, []);

  const spawnWave = useCallback((waveNum: number, selectedMode: KidChallengeMode) => {
    const sim = simRef.current;
    const levelTier = Math.max(1, Math.ceil(waveNum / 3));
    const wave = generateKidChallengeWave(selectedMode, levelTier);
    sim.currentWave = wave;

    const w = Math.max(360, sim.width);
    const laneCount = wave.stars.length;
    const marginX = Math.min(86, w * 0.14);
    const usableW = Math.max(200, w - marginX * 2);
    const baseFallSpeed = 68 + Math.min(58, waveNum * 5.5);

    sim.stars = wave.stars.map((opt, idx) => {
      const laneX =
        laneCount > 1
          ? marginX + (usableW * idx) / (laneCount - 1) + (Math.random() - 0.5) * 20
          : w / 2;
      return {
        x: Math.max(46, Math.min(w - 46, laneX)),
        y: -50 - idx * 36 - Math.random() * 24,
        vx: (Math.random() - 0.5) * 22,
        vy: baseFallSpeed + (idx % 2) * 8,
        radius: 32,
        label: opt.label,
        isCorrect: opt.isCorrect,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() > 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.45),
        pulsePhase: idx * 1.1,
        active: true,
      };
    });

    // Spawn periodic bonus comet every 3rd wave
    if (waveNum % 3 === 0) {
      sim.stars.push({
        x: Math.max(60, Math.min(w - 60, w * (0.25 + Math.random() * 0.5))),
        y: -120,
        vx: 0,
        vy: baseFallSpeed * 1.16,
        radius: 22,
        label: '+50',
        isCorrect: true,
        isBonus: true,
        rotation: 0,
        rotSpeed: 1.8,
        pulsePhase: 0,
        active: true,
      });
    }

    setHud({
      score: sim.score,
      lives: sim.lives,
      combo: sim.combo,
      wave: waveNum,
      starsCaught: sim.starsCaught,
      attempts: sim.attempts,
      promptText: wave.promptText,
      hintText: wave.hintText,
    });
  }, []);

  const reportFinalRoundIfNeeded = useCallback(
    (finalScore: number, starsCaught: number, attempts: number) => {
      if (rewardReportedRef.current) return;
      rewardReportedRef.current = true;
      const accuracyPct =
        attempts > 0 ? Math.min(100, Math.round((starsCaught / attempts) * 100)) : 100;
      const xpEarned = Math.max(15, Math.min(250, Math.round(finalScore / 8)));
      onFinishRound({
        score: finalScore,
        xpEarned,
        starsCaught,
        accuracyPct,
      });
    },
    [onFinishRound]
  );

  const startFreshRun = useCallback(() => {
    const sim = simRef.current;
    rewardReportedRef.current = false;
    sim.playerX = sim.width / 2;
    sim.playerVx = 0;
    sim.squashX = 1;
    sim.squashY = 1;
    sim.dashCooldown = 0;
    sim.dashTimer = 0;
    sim.hurtFlash = 0;
    sim.hitstopTimer = 0;
    sim.shakeMag = 0;
    sim.score = 0;
    sim.lives = 3;
    sim.combo = 0;
    sim.waveIndex = 1;
    sim.starsCaught = 0;
    sim.attempts = 0;
    sim.popups = [];
    for (const p of sim.particles) p.active = false;
    keysRef.current = { left: false, right: false };
    touchDirRef.current = 0;
    dashBufferRef.current = 0;

    setPhase('PLAYING');
    phaseRef.current = 'PLAYING';
    spawnWave(1, modeRef.current);
    if (!mutedRef.current) {
      soundEngine.playTone(523.25, 110, 'triangle', 0.08);
    }
  }, [spawnWave]);

  const triggerDash = useCallback(() => {
    dashBufferRef.current = 0.14;
  }, []);

  // Keyboard bindings & window.blur safety
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        keysRef.current.left = true;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        keysRef.current.right = true;
      } else if (e.code === 'Space') {
        if (phaseRef.current === 'TITLE_MENU') {
          e.preventDefault();
          startFreshRun();
        } else if (phaseRef.current === 'PLAYING') {
          e.preventDefault();
          dashBufferRef.current = 0.14;
        }
      } else if (e.code === 'Enter' && phaseRef.current === 'TITLE_MENU') {
        e.preventDefault();
        startFreshRun();
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (phaseRef.current === 'PLAYING') {
          setPhase('PAUSED');
        } else if (phaseRef.current === 'PAUSED') {
          setPhase('PLAYING');
        } else if (phaseRef.current === 'TITLE_MENU' && e.code === 'Escape') {
          onClose();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        keysRef.current.left = false;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        keysRef.current.right = false;
      }
    };

    const handleBlur = () => {
      keysRef.current.left = false;
      keysRef.current.right = false;
      touchDirRef.current = 0;
      if (phaseRef.current === 'PLAYING') {
        setPhase('PAUSED');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [open, onClose, startFreshRun]);

  // Isolated 60fps Canvas Loop + ResizeObserver
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(320, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const prevW = simRef.current.width || w;
      simRef.current.width = w;
      simRef.current.height = h;
      simRef.current.playerX = Math.max(44, Math.min(w - 44, (simRef.current.playerX / prevW) * w));
    };

    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    ro.observe(container);

    let rafId = 0;
    let lastTs = performance.now();

    const stepAndRender = (now: number) => {
      rafId = 0;
      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const sim = simRef.current;
      const w = sim.width;
      const h = sim.height;
      const playerY = h - 94;

      // Update simulation only when actively PLAYING
      if (phaseRef.current === 'PLAYING') {
        if (sim.hitstopTimer > 0) {
          sim.hitstopTimer = Math.max(0, sim.hitstopTimer - dt);
        } else {
          // Player horizontal steering & dash
          const moveDir =
            touchDirRef.current !== 0
              ? touchDirRef.current
              : (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);

          if (dashBufferRef.current > 0) {
            dashBufferRef.current = Math.max(0, dashBufferRef.current - dt);
            if (sim.dashCooldown <= 0) {
              sim.dashTimer = 0.22;
              sim.dashCooldown = 0.65;
              sim.squashX = 1.28;
              sim.squashY = 0.78;
              dashBufferRef.current = 0;
              if (!mutedRef.current) {
                soundEngine.playTone(720, 90, 'sine', 0.06);
              }
            }
          }

          if (sim.dashCooldown > 0) sim.dashCooldown = Math.max(0, sim.dashCooldown - dt);
          if (sim.dashTimer > 0) sim.dashTimer = Math.max(0, sim.dashTimer - dt);
          if (sim.hurtFlash > 0) sim.hurtFlash = Math.max(0, sim.hurtFlash - dt);

          const baseSpeed = sim.dashTimer > 0 ? 740 : 420;
          const targetVx = moveDir * baseSpeed;
          sim.playerVx += (targetVx - sim.playerVx) * Math.min(1, dt * 16);
          sim.playerX = Math.max(40, Math.min(w - 40, sim.playerX + sim.playerVx * dt));

          // Relax squash-and-stretch back to 1
          sim.squashX += (1 - sim.squashX) * Math.min(1, dt * 11);
          sim.squashY += (1 - sim.squashY) * Math.min(1, dt * 11);

          // Advance stars & handle catches
          let waveCleared = false;
          let correctStillFalling = false;

          for (const star of sim.stars) {
            if (!star.active) continue;
            star.y += star.vy * dt;
            star.x += star.vx * dt;
            star.rotation += star.rotSpeed * dt;
            star.pulsePhase += dt * 4;

            if (star.x < 42 || star.x > w - 42) {
              star.vx *= -1;
              star.x = Math.max(42, Math.min(w - 42, star.x));
            }

            // Catch collision with AI Buddy basket
            const dx = star.x - sim.playerX;
            const dy = star.y - playerY;
            const catchDist = star.radius + 34;
            if (dx * dx + dy * dy <= catchDist * catchDist) {
              star.active = false;
              if (star.isBonus) {
                sim.score += 50;
                sim.squashX = 1.24;
                sim.squashY = 0.8;
                sim.shakeMag = Math.max(sim.shakeMag, 4);
                spawnBurst(star.x, star.y, '#38bdf8', 16);
                sim.popups.push({ x: star.x, y: star.y - 16, text: '+50 Sao Băng!', color: '#38bdf8', life: 0.9 });
                if (!mutedRef.current) soundEngine.playGameFeedback('collect');
                setHud((prev) => ({ ...prev, score: sim.score }));
                continue;
              }

              sim.attempts += 1;
              if (star.isCorrect) {
                sim.combo += 1;
                sim.starsCaught += 1;
                const earned = 100 + Math.min(100, (sim.combo - 1) * 25);
                sim.score += earned;
                sim.hitstopTimer = 0.045;
                sim.shakeMag = Math.max(sim.shakeMag, 6);
                sim.squashX = 1.3;
                sim.squashY = 0.74;
                spawnBurst(star.x, star.y, '#fde047', 24);
                sim.popups.push({
                  x: star.x,
                  y: star.y - 18,
                  text: sim.combo > 1 ? `+${earned} · x${sim.combo}!` : `+${earned}!`,
                  color: '#fde047',
                  life: 0.95,
                });
                if (!mutedRef.current) soundEngine.playGameFeedback('collect');
                waveCleared = true;
                break;
              } else {
                sim.combo = 0;
                sim.lives = Math.max(0, sim.lives - 1);
                sim.hurtFlash = 0.5;
                sim.shakeMag = Math.max(sim.shakeMag, 9);
                sim.squashX = 0.78;
                sim.squashY = 1.25;
                spawnBurst(star.x, star.y, '#fb7185', 18);
                sim.popups.push({
                  x: star.x,
                  y: star.y - 18,
                  text: 'Chưa đúng!',
                  color: '#fb7185',
                  life: 0.9,
                });
                if (!mutedRef.current) soundEngine.playGameFeedback('error');
                setHud((prev) => ({
                  ...prev,
                  lives: sim.lives,
                  combo: 0,
                  attempts: sim.attempts,
                }));
                if (sim.lives <= 0) {
                  phaseRef.current = 'GAME_OVER';
                  setPhase('GAME_OVER');
                  reportFinalRoundIfNeeded(sim.score, sim.starsCaught, sim.attempts);
                  break;
                }
              }
            } else if (star.y > h + 38) {
              star.active = false;
            } else if (star.isCorrect && !star.isBonus) {
              correctStillFalling = true;
            }
          }

          if (phaseRef.current === 'PLAYING') {
            if (waveCleared) {
              if (sim.waveIndex >= TOTAL_WAVES) {
                phaseRef.current = 'VICTORY';
                setPhase('VICTORY');
                setHud((prev) => ({
                  ...prev,
                  score: sim.score,
                  starsCaught: sim.starsCaught,
                  attempts: sim.attempts,
                }));
                if (!mutedRef.current) soundEngine.playGameFeedback('win');
                reportFinalRoundIfNeeded(sim.score, sim.starsCaught, sim.attempts);
              } else {
                sim.waveIndex += 1;
                spawnWave(sim.waveIndex, modeRef.current);
              }
            } else if (!correctStillFalling) {
              // Missed the correct star completely — lose 1 heart and serve a fresh wave
              sim.attempts += 1;
              sim.combo = 0;
              sim.lives = Math.max(0, sim.lives - 1);
              sim.hurtFlash = 0.4;
              sim.popups.push({
                x: sim.playerX,
                y: playerY - 40,
                text: 'Ngôi sao bay mất rồi!',
                color: '#fbbf24',
                life: 0.95,
              });
              if (!mutedRef.current) soundEngine.playGameFeedback('error');
              if (sim.lives <= 0) {
                phaseRef.current = 'GAME_OVER';
                setPhase('GAME_OVER');
                setHud((prev) => ({
                  ...prev,
                  lives: 0,
                  combo: 0,
                  attempts: sim.attempts,
                }));
                reportFinalRoundIfNeeded(sim.score, sim.starsCaught, sim.attempts);
              } else {
                spawnWave(sim.waveIndex, modeRef.current);
              }
            }
          }
        }
      }

      // Particles & popups always animate smoothly until settled
      let hasActiveFx = false;
      for (const p of sim.particles) {
        if (!p.active) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 240 * dt;
        p.life -= dt;
        if (p.life <= 0) p.active = false;
        else hasActiveFx = true;
      }
      sim.popups = sim.popups.filter((pop) => {
        pop.y -= 42 * dt;
        pop.life -= dt;
        return pop.life > 0;
      });
      if (sim.popups.length > 0) hasActiveFx = true;
      if (sim.shakeMag > 0) {
        sim.shakeMag = Math.max(0, sim.shakeMag - 26 * dt);
        if (sim.shakeMag > 0.1) hasActiveFx = true;
      }

      // Render Canvas
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = canvas.width / w;
        ctx.save();
        ctx.scale(dpr, dpr);

        if (sim.shakeMag > 0.2) {
          ctx.translate(
            (Math.random() - 0.5) * sim.shakeMag * 2,
            (Math.random() - 0.5) * sim.shakeMag * 2
          );
        }

        // 1. Clear transparent canvas so composited twilight backdrop img shows smoothly
        ctx.clearRect(0, 0, w, h);

        // Subtle atmospheric scrim for star contrast
        ctx.fillStyle = 'rgba(5, 9, 20, 0.28)';
        ctx.fillRect(0, 0, w, h);

        // Twinkling background sky stars
        for (const t of sim.twinkles) {
          const alpha = 0.28 + 0.5 * Math.abs(Math.sin(now * 0.0018 + t.phase));
          ctx.fillStyle = `rgba(224, 242, 254, ${alpha.toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(t.rx * w, t.ry * h * 0.72, t.r, 0, Math.PI * 2);
          ctx.fill();
        }

        // Ground glow path
        const groundGrad = ctx.createLinearGradient(0, h - 85, 0, h);
        groundGrad.addColorStop(0, 'rgba(13, 148, 136, 0.0)');
        groundGrad.addColorStop(1, 'rgba(13, 148, 136, 0.26)');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, h - 85, w, 85);

        ctx.strokeStyle = 'rgba(45, 212, 191, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(24, playerY + 34);
        ctx.lineTo(w - 24, playerY + 34);
        ctx.stroke();

        // 2. Falling Stars
        for (const star of sim.stars) {
          if (!star.active) continue;
          const pulse = 1 + 0.05 * Math.sin(star.pulsePhase);
          const outerR = star.radius * pulse;
          const innerR = outerR * 0.52;

          ctx.save();
          ctx.fillStyle = star.isBonus ? 'rgba(56, 189, 248, 0.25)' : 'rgba(250, 204, 21, 0.22)';
          ctx.beginPath();
          ctx.arc(star.x, star.y, outerR + 10, 0, Math.PI * 2);
          ctx.fill();

          drawFivePointStar(ctx, star.x, star.y, outerR, innerR, star.rotation);
          ctx.fillStyle = star.isBonus ? '#38bdf8' : '#facc15';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = star.isBonus ? '#e0f2fe' : '#fef9c3';
          ctx.stroke();

          ctx.font = '700 15px "JetBrains Mono", "Plus Jakarta Sans", sans-serif';
          const textW = Math.max(38, ctx.measureText(star.label).width + 18);
          const boxH = 26;
          const bx = star.x - textW / 2;
          const by = star.y - boxH / 2;
          ctx.fillStyle = 'rgba(9, 14, 30, 0.9)';
          ctx.beginPath();
          ctx.roundRect(bx, by, textW, boxH, 8);
          ctx.fill();
          ctx.strokeStyle = star.isBonus ? '#7dd3fc' : '#fde047';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(star.label, star.x, star.y + 0.5);
          ctx.restore();
        }

        // 3. Player AI Buddy Explorer
        ctx.save();
        ctx.translate(sim.playerX, playerY);
        ctx.scale(sim.squashX, sim.squashY);

        if (sim.hurtFlash > 0 && Math.floor(sim.hurtFlash * 16) % 2 === 0) {
          ctx.globalAlpha = 0.55;
        }

        ctx.strokeStyle = sim.dashTimer > 0 ? '#38bdf8' : 'rgba(45, 212, 191, 0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, -14, 34, 10, 0, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = suitColor || '#0d9488';
        ctx.beginPath();
        ctx.roundRect(-20, -10, 40, 38, 14);
        ctx.fill();
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(0, -24, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(-12, -31, 24, 14, 7);
        ctx.fill();

        ctx.fillStyle = '#2dd4bf';
        ctx.beginPath();
        ctx.arc(-5, -24, 2.5, 0, Math.PI * 2);
        ctx.arc(5, -24, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // 4. Pooled Particles
        for (const p of sim.particles) {
          if (!p.active) continue;
          const alpha = Math.max(0, p.life / p.maxLife);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // 5. Floating Score / Feedback Text
        for (const pop of sim.popups) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, pop.life * 1.4);
          ctx.font = '700 16px "Plus Jakarta Sans", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#020617';
          ctx.fillText(pop.text, pop.x + 1, pop.y + 1);
          ctx.fillStyle = pop.color;
          ctx.fillText(pop.text, pop.x, pop.y);
          ctx.restore();
        }

        ctx.restore();
      }

      if (phaseRef.current === 'PLAYING' || hasActiveFx) {
        rafId = window.requestAnimationFrame(stepAndRender);
      }
    };

    lastTs = performance.now();
    rafId = window.requestAnimationFrame(stepAndRender);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [open, phase, reportFinalRoundIfNeeded, spawnBurst, spawnWave, suitColor]);

  if (!open) return null;

  const accuracyPct =
    hud.attempts > 0 ? Math.min(100, Math.round((hud.starsCaught / hud.attempts) * 100)) : 100;
  const displayBest = Math.max(bestScore, hud.score);
  const previewXp = Math.max(15, Math.min(250, Math.round(hud.score / 8)));

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-[#050914] text-slate-100 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Game Kid: Bé Hứng Sao Học Toán & Từ vựng"
    >
      {/* Full-viewport Playfield Container */}
      <div ref={containerRef} className="relative h-full w-full flex-1 overflow-hidden bg-gradient-to-b from-[#070b1e] via-[#0b1e36] to-[#09242d]">
        {!bgFailed && (
          <img
            src="/src/assets/images/kid_star_adventure_bg_1794800546818.jpg"
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            onError={() => setBgFailed(true)}
            className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          />
        )}
        <canvas ref={canvasRef} className="relative z-[1] block h-full w-full" />

        {/* Live Gameplay HUD Overlay (pointer-events-none so canvas & touch targets stay clean) */}
        {phase === 'PLAYING' && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-2 p-3.5 sm:p-5">
            {/* Left Score & Hearts */}
            <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-slate-950/80 px-3.5 py-2">
              <div className="flex items-center gap-1" aria-label={`${hud.lives} mạng`}>
                {[0, 1, 2].map((idx) => (
                  <Heart
                    key={idx}
                    className={`h-4 w-4 ${
                      idx < hud.lives ? 'fill-rose-500 text-rose-400' : 'text-slate-600'
                    }`}
                  />
                ))}
              </div>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-sm font-bold text-amber-300 tabular-nums">
                {hud.score} điểm
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-xs text-teal-300 tabular-nums">
                Sóng {hud.wave}/{TOTAL_WAVES}
                {hud.combo > 1 ? ` · Combo x${hud.combo}` : ''}
              </span>
            </div>

            {/* Center Prompt Target */}
            <div className="order-3 mx-auto w-full max-w-md rounded-xl border border-teal-400/40 bg-slate-950/85 px-4 py-1.5 text-center sm:order-2 sm:w-auto">
              <div className="text-[11px] font-medium text-teal-300">
                {companionName} — Hãy hứng ngôi sao đúng!
              </div>
              <div className="font-display text-lg font-bold text-white sm:text-xl">
                {hud.promptText}
              </div>
            </div>

            {/* Right Sound & Pause Controls (pointer-events-auto, >= 44px) */}
            <div className="pointer-events-auto order-2 flex items-center gap-2 sm:order-3">
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                aria-label={muted ? 'Bật âm thanh game' : 'Tắt âm thanh game'}
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-slate-950/80 text-white hover:bg-slate-800"
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => setPhase((p) => (p === 'PLAYING' ? 'PAUSED' : 'PLAYING'))}
                aria-label="Tạm dừng trò chơi"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-slate-950/80 text-white hover:bg-slate-800"
              >
                <Pause className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        {/* Touch & On-Screen Controls during Playing (>= 48px touch targets) */}
        {phase === 'PLAYING' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-between px-4 sm:px-6">
            <div className="pointer-events-auto flex items-center gap-2.5">
              <button
                type="button"
                aria-label="Di chuyển sang trái"
                onPointerDown={() => {
                  touchDirRef.current = -1;
                }}
                onPointerUp={() => {
                  if (touchDirRef.current === -1) touchDirRef.current = 0;
                }}
                onPointerLeave={() => {
                  if (touchDirRef.current === -1) touchDirRef.current = 0;
                }}
                onPointerCancel={() => {
                  touchDirRef.current = 0;
                }}
                className="flex h-12 min-w-[68px] items-center justify-center rounded-xl border border-white/25 bg-slate-950/80 px-4 text-sm font-bold text-white active:bg-teal-600"
              >
                ← Trái
              </button>
              <button
                type="button"
                aria-label="Di chuyển sang phải"
                onPointerDown={() => {
                  touchDirRef.current = 1;
                }}
                onPointerUp={() => {
                  if (touchDirRef.current === 1) touchDirRef.current = 0;
                }}
                onPointerLeave={() => {
                  if (touchDirRef.current === 1) touchDirRef.current = 0;
                }}
                onPointerCancel={() => {
                  touchDirRef.current = 0;
                }}
                className="flex h-12 min-w-[68px] items-center justify-center rounded-xl border border-white/25 bg-slate-950/80 px-4 text-sm font-bold text-white active:bg-teal-600"
              >
                Phải →
              </button>
            </div>

            <button
              type="button"
              onClick={triggerDash}
              className="pointer-events-auto inline-flex h-12 items-center gap-1.5 rounded-xl border border-sky-400/50 bg-sky-500/25 px-4 text-xs font-bold text-sky-100 active:bg-sky-500"
            >
              <Zap className="h-4 w-4" />
              <span>Tăng tốc (Space)</span>
            </button>
          </div>
        )}

        {/* TITLE SCREEN OVERLAY */}
        {phase === 'TITLE_MENU' && (
          <div className="absolute inset-0 z-20 flex flex-col justify-between bg-slate-950/68 p-5 sm:p-8">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-teal-300">
                NexaLife OS Arcade · Dành cho Bé & Gia đình
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-white/20 bg-slate-900/85 px-4 text-xs font-semibold text-white hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
                <span>Thoát</span>
              </button>
            </div>

            <div className="mx-auto flex w-full max-w-xl flex-col items-center text-center">
              {/* Bespoke SVG Title Lockup */}
              <svg
                viewBox="0 0 340 84"
                className="h-20 w-full max-w-sm"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="kidTitleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#fde047" />
                    <stop offset="50%" stopColor="#2dd4bf" />
                    <stop offset="100%" stopColor="#38bdf8" />
                  </linearGradient>
                </defs>
                <polygon
                  points="44,12 50,27 66,28 53,38 57,54 44,45 31,54 35,38 22,28 38,27"
                  fill="#fde047"
                />
                <polygon
                  points="296,12 302,27 318,28 305,38 309,54 296,45 283,54 287,38 274,28 290,27"
                  fill="#38bdf8"
                />
                <text
                  x="170"
                  y="42"
                  textAnchor="middle"
                  fill="url(#kidTitleGrad)"
                  fontSize="30"
                  fontWeight="800"
                  fontFamily="Plus Jakarta Sans, sans-serif"
                >
                  BÉ HỨNG SAO
                </text>
                <text
                  x="170"
                  y="68"
                  textAnchor="middle"
                  fill="#cbd5e1"
                  fontSize="12"
                  fontWeight="600"
                  letterSpacing="2"
                  fontFamily="JetBrains Mono, monospace"
                >
                  STAR CATCHER ADVENTURE
                </text>
              </svg>

              <p className="mt-2 max-w-md text-sm text-slate-200">
                Điều khiển {companionName} di chuyển qua trái phải để hứng đúng ngôi sao đáp án Toán học và Từ vựng Tiếng Anh!
              </p>

              {/* Mode Selector */}
              <div className="mt-5 grid w-full max-w-md grid-cols-3 gap-2">
                {(
                  [
                    { id: 'math', label: 'Toán học' },
                    { id: 'vocab', label: 'Từ vựng Anh' },
                    { id: 'mix', label: 'Hỗn hợp' },
                  ] as Array<{ id: KidChallengeMode; label: string }>
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setMode(item.id)}
                    className={`h-11 rounded-xl border text-xs font-bold transition-colors ${
                      mode === item.id
                        ? 'border-teal-400 bg-teal-500 text-slate-950'
                        : 'border-white/20 bg-slate-900/80 text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-4 font-mono text-xs text-amber-300 tabular-nums">
                Kỷ lục hiện tại: {bestScore} điểm · Hoàn thành {TOTAL_WAVES} sóng để chiến thắng
              </div>

              <button
                type="button"
                onClick={startFreshRun}
                className="mt-5 inline-flex h-12 min-w-[210px] items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 text-base font-extrabold text-slate-950 shadow-lg hover:bg-amber-300 transition-colors"
              >
                <Play className="h-5 w-5 fill-slate-950" />
                <span>Bắt đầu chơi</span>
              </button>
            </div>

            <div className="text-center font-mono text-xs text-slate-300">
              ← → / A D Di chuyển · Space Tăng tốc · P / Esc Tạm dừng
            </div>
          </div>
        )}

        {/* PAUSED / VICTORY / GAME OVER MODAL */}
        {(phase === 'PAUSED' || phase === 'VICTORY' || phase === 'GAME_OVER') && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4">
            <div className="w-full max-w-md rounded-2xl border border-white/15 bg-slate-900 p-6 text-center shadow-2xl">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300">
                {phase === 'VICTORY' ? (
                  <Trophy className="h-6 w-6 text-amber-300" />
                ) : phase === 'PAUSED' ? (
                  <Pause className="h-6 w-6" />
                ) : (
                  <Sparkles className="h-6 w-6 text-rose-300" />
                )}
              </div>

              <h2 className="mt-3 font-display text-2xl font-bold text-white">
                {phase === 'VICTORY'
                  ? 'Tuyệt vời! Bé đã chiến thắng!'
                  : phase === 'PAUSED'
                    ? 'Đang tạm dừng'
                    : 'Hết lượt thám hiểm rồi!'}
              </h2>
              <p className="mt-1 text-xs text-slate-300">
                {phase === 'VICTORY'
                  ? `Bé đã chinh phục đủ ${TOTAL_WAVES} sóng sao cùng ${companionName}.`
                  : phase === 'PAUSED'
                    ? 'Sẵn sàng tiếp tục hành trình hứng sao bất cứ lúc nào.'
                    : 'Đừng lo! Mỗi lượt chơi đều giúp bé nhớ Toán & Từ vựng nhanh hơn.'}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-left">
                <div>
                  <div className="text-[11px] text-slate-400">Điểm số</div>
                  <div className="font-mono text-lg font-bold text-amber-300 tabular-nums">
                    {hud.score}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Kỷ lục</div>
                  <div className="font-mono text-lg font-bold text-white tabular-nums">
                    {displayBest}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">Sao đã hứng · Chính xác</div>
                  <div className="font-mono text-sm font-semibold text-teal-300 tabular-nums">
                    {hud.starsCaught} sao · {accuracyPct}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-400">XP nhận được</div>
                  <div className="font-mono text-sm font-semibold text-sky-300 tabular-nums">
                    +{phase === 'PAUSED' ? 0 : previewXp} XP
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-2.5">
                {phase === 'PAUSED' && (
                  <button
                    type="button"
                    onClick={() => setPhase('PLAYING')}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-teal-500 text-sm font-bold text-slate-950 hover:bg-teal-400"
                  >
                    <Play className="h-4 w-4 fill-slate-950" />
                    <span>Tiếp tục chơi</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={startFreshRun}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-400 text-sm font-bold text-slate-950 hover:bg-amber-300"
                >
                  <RotateCcw className="h-4 w-4" />
                  <span>Chơi lại từ đầu</span>
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-700 text-sm font-medium text-slate-200 hover:bg-slate-800"
                >
                  <span>Thoát về AI Game World</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
