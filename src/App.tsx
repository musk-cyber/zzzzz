/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

// --- Constants ---
const HEART_COLOR = "#EEAEEE";
const BACKGROUND_COLOR = "#000000";
const IMAGE_ENLARGE = 11;
const GENERATE_FRAMES = 20;
const BPM = 70;
const BEAT_INTERVAL = 60 / BPM; // seconds per beat

interface Point {
  x: number;
  y: number;
  size: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  opacity: number;
  scale: number;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dimensions, setDimensions] = useState({ width: 840, height: 680 });
  const framesRef = useRef<Point[][]>([]);
  const animationFrameId = useRef<number>(0);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastBeatTimeRef = useRef<number>(0);
  const [isAudioStarted, setIsAudioStarted] = useState(false);

  // Initialize Audio Context on first interaction
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      setIsAudioStarted(true);
    } else if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
      setIsAudioStarted(true);
    }
  }, []);

  const playHeartbeatSound = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state !== 'running') return;

    const ctx = audioContextRef.current;
    const now = ctx.currentTime;

    // "Lub" sound (S1)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(60, now);
    osc1.frequency.exponentialRampToValueAtTime(40, now + 0.1);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.5, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // "Dub" sound (S2) - slightly higher and shorter, delayed
    const delay = 0.15;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(70, now + delay);
    osc2.frequency.exponentialRampToValueAtTime(50, now + delay + 0.08);
    gain2.gain.setValueAtTime(0, now + delay);
    gain2.gain.linearRampToValueAtTime(0.4, now + delay + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + delay);
    osc2.stop(now + delay + 0.1);
  }, []);

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const { width, height } = dimensions;
    const centerX = width / 2;
    const centerY = height / 2;

    const heartFunction = (t: number): [number, number] => {
      const x = 17 * Math.pow(Math.sin(t), 3);
      const y = -(16 * Math.cos(t) - 5 * Math.cos(2 * t) - 3 * Math.cos(3 * t));

      return [
        x * IMAGE_ENLARGE + centerX,
        y * IMAGE_ENLARGE + centerY
      ];
    };

    const scatterInside = (x: number, y: number, beta = 0.15): [number, number] => {
      const ratioX = -beta * Math.log(Math.random());
      const ratioY = -beta * Math.log(Math.random());
      return [x - ratioX * (x - centerX), y - ratioY * (y - centerY)];
    };

    const shrink = (x: number, y: number, ratio: number): [number, number] => {
      const distSq = Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2);
      const force = -1 / Math.pow(distSq, 0.6);
      return [x - ratio * force * (x - centerX), y - ratio * force * (y - centerY)];
    };

    const curve = (p: number): number => {
      return 2 * (2 * Math.sin(4 * p)) / (2 * Math.PI);
    };

    const calcPosition = (x: number, y: number, ratio: number): [number, number] => {
      const distSq = Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2);
      const force = 1 / Math.pow(distSq, 0.42);
      const dx = ratio * force * (x - centerX) + (Math.random() * 2 - 1);
      const dy = ratio * force * (y - centerY) + (Math.random() * 2 - 1);
      return [x - dx, y - dy];
    };

    const basePoints: [number, number][] = [];
    const edgeDiffusionPoints: [number, number][] = [];
    const centerDiffusionPoints: [number, number][] = [];

    for (let i = 0; i < 1000; i++) {
      basePoints.push(heartFunction(Math.random() * 2 * Math.PI));
    }

    basePoints.forEach(([bx, by]) => {
      for (let i = 0; i < 3; i++) {
        edgeDiffusionPoints.push(scatterInside(bx, by, 0.05));
      }
    });

    for (let i = 0; i < 5000; i++) {
      const [bx, by] = basePoints[Math.floor(Math.random() * basePoints.length)];
      centerDiffusionPoints.push(scatterInside(bx, by, 0.27));
    }

    const generatedFrames: Point[][] = [];
    for (let frame = 0; frame < GENERATE_FRAMES; frame++) {
      const p = (frame / GENERATE_FRAMES) * Math.PI;
      const ratio = 15 * curve(p);
      const haloRadius = 4 + 6 * (1 + curve(p));
      const haloNumber = Math.floor(1500 + 2000 * Math.pow(Math.abs(curve(p)), 2));

      const framePoints: Point[] = [];

      for (let i = 0; i < haloNumber; i++) {
        let [hx, hy] = heartFunction(Math.random() * 2 * Math.PI);
        [hx, hy] = shrink(hx, hy, haloRadius);
        framePoints.push({ 
          x: hx + (Math.random() * 120 - 60), 
          y: hy + (Math.random() * 120 - 60), 
          size: Math.random() < 0.66 ? 1 : 2 
        });
      }

      basePoints.forEach(([bx, by]) => {
        const [px, py] = calcPosition(bx, by, ratio);
        framePoints.push({ x: px, y: py, size: Math.floor(Math.random() * 3) + 1 });
      });

      edgeDiffusionPoints.forEach(([ex, ey]) => {
        const [px, py] = calcPosition(ex, ey, ratio);
        framePoints.push({ x: px, y: py, size: Math.floor(Math.random() * 2) + 1 });
      });

      centerDiffusionPoints.forEach(([cx, cy]) => {
        const [px, py] = calcPosition(cx, cy, ratio);
        framePoints.push({ x: px, y: py, size: Math.floor(Math.random() * 2) + 1 });
      });

      generatedFrames.push(framePoints);
    }

    framesRef.current = generatedFrames;
  }, [dimensions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = (time: number) => {
      if (framesRef.current.length === 0) {
        animationFrameId.current = requestAnimationFrame(render);
        return;
      }

      // Calculate current frame based on 70 BPM
      const seconds = time / 1000;
      const beatProgress = (seconds % BEAT_INTERVAL) / BEAT_INTERVAL;
      
      // Trigger sound at the start of the beat
      if (seconds - lastBeatTimeRef.current >= BEAT_INTERVAL) {
        playHeartbeatSound();
        lastBeatTimeRef.current = seconds;
      }

      // Map beat progress to frame index (0-19)
      const frameIndex = Math.floor(beatProgress * GENERATE_FRAMES);

      ctx.fillStyle = BACKGROUND_COLOR;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const currentFramePoints = framesRef.current[frameIndex % GENERATE_FRAMES];
      ctx.fillStyle = HEART_COLOR;
      currentFramePoints.forEach((p) => {
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });

      // Update floating texts
      setFloatingTexts(prev => 
        prev
          .map(t => ({ ...t, y: t.y - 1, opacity: t.opacity - 0.01, scale: t.scale + 0.005 }))
          .filter(t => t.opacity > 0)
      );

      animationFrameId.current = requestAnimationFrame(render);
    };

    animationFrameId.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId.current);
  }, [playHeartbeatSound]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    initAudio();
    const newText: FloatingText = {
      id: Date.now(),
      x: e.clientX,
      y: e.clientY,
      opacity: 1,
      scale: 1,
    };
    setFloatingTexts(prev => [...prev, newText]);
  };

  return (
    <div 
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden cursor-pointer"
      onClick={handleCanvasClick}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="block"
      />
      
      {floatingTexts.map(text => (
        <div
          key={text.id}
          className="absolute pointer-events-none font-bold text-2xl select-none"
          style={{
            left: text.x,
            top: text.y,
            color: HEART_COLOR,
            opacity: text.opacity,
            transform: `translate(-50%, -50%) scale(${text.scale})`,
            textShadow: '0 0 10px rgba(238, 174, 238, 0.5)'
          }}
        >
          LOVE YOU
        </div>
      ))}

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        <div className="text-white/20 font-mono text-xs tracking-widest uppercase">
          70 BPM • Heartbeat Sync
        </div>
        {!isAudioStarted && (
          <div className="text-white/40 text-[10px] animate-pulse">
            Click to enable sound
          </div>
        )}
      </div>
    </div>
  );
}
