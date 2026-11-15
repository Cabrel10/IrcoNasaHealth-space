import React, { useEffect, useMemo } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import earthBg from '@/assets/backgrounds/earth-orbit-bg.jpg';
import { useMissionStore } from '@/stores/useMissionStore';
import { useReducedMotion } from '@/hooks/useChrono';
import { SPRING_PARALLAX } from '@/constants/motion';

export const SpaceBackground: React.FC = () => {
  const activeNavId = useMissionStore((s) => s.activeNavId);
  const isCrewView = activeNavId === 'crew-health';
  const reducedMotion = useReducedMotion();

  // Mouse Parallax
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = SPRING_PARALLAX;
  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);

  const bgParallaxX = useTransform(smoothX, [-0.5, 0.5], [-8, 8]);
  const bgParallaxY = useTransform(smoothY, [-0.5, 0.5], [-8, 8]);

  const starsParallaxX = useTransform(smoothX, [-0.5, 0.5], [-14, 14]);
  const starsParallaxY = useTransform(smoothY, [-0.5, 0.5], [-14, 14]);

  useEffect(() => {
    if (reducedMotion) return;
    const handleMouseMove = (e: MouseEvent) => {
      const { innerWidth, innerHeight } = window;
      if (innerWidth < 1024) return; // Disable parallax on smaller screens
      const nx = e.clientX / innerWidth - 0.5;
      const ny = e.clientY / innerHeight - 0.5;
      mouseX.set(nx);
      mouseY.set(ny);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY, reducedMotion]);

  // Deterministic Star Generation
  const { starsLayer1, starsLayer2 } = useMemo(() => {
    const s1: Array<{ id: number; top: number; left: number; size: number; delay: number; dur: number }> = [];
    const s2: Array<{ id: number; top: number; left: number; size: number; delay: number; dur: number }> = [];

    for (let i = 0; i < 90; i++) {
      const seed1 = (i * 9301 + 49297) % 233280;
      const seed2 = (i * 7919 + 65537) % 233280;
      s1.push({
        id: i,
        top: (seed1 / 233280) * 100,
        left: (seed2 / 233280) * 100,
        size: 1 + (i % 3) * 0.7,
        delay: (i % 7) * 0.8,
        dur: 4 + (i % 4),
      });
    }

    for (let j = 0; j < 60; j++) {
      const seed3 = (j * 4999 + 8191) % 233280;
      const seed4 = (j * 6271 + 131071) % 233280;
      s2.push({
        id: j + 100,
        top: (seed3 / 233280) * 100,
        left: (seed4 / 233280) * 100,
        size: 1.5 + (j % 2) * 1.2,
        delay: (j % 5) * 1.1,
        dur: 5 + (j % 3),
      });
    }

    return { starsLayer1: s1, starsLayer2: s2 };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 select-none overflow-hidden bg-[#01040c]">
      {/* Persistent Earth Orbit Background Image with Slow Drift */}
      <motion.div
        className="absolute inset-[-4%] w-[108%] h-[108%]"
        style={{
          x: reducedMotion ? 0 : bgParallaxX,
          y: reducedMotion ? (isCrewView ? -24 : 0) : bgParallaxY,
        }}
        animate={{
          scale: reducedMotion ? 1 : isCrewView ? 1.05 : [1, 1.03, 1],
          y: isCrewView ? -24 : 0,
        }}
        transition={{
          scale: { duration: 20, repeat: Infinity, ease: 'easeInOut' },
          y: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
        }}
      >
        <img
          src={earthBg}
          alt="Earth orbit background"
          className="w-full h-full object-cover object-bottom opacity-90"
        />
        {/* Atmosphere glow overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 100% 45% at 50% 100%, rgba(0,207,255,0.22) 0%, rgba(10,50,110,0.4) 30%, rgba(2,11,24,0.7) 65%, #020B18 100%)',
          }}
        />
      </motion.div>

      {/* Stars Layer 1 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          x: reducedMotion ? 0 : starsParallaxX,
          y: reducedMotion ? 0 : starsParallaxY,
        }}
      >
        {starsLayer1.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-white"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animation: reducedMotion
                ? 'none'
                : `twinkle ${star.dur}s ease-in-out ${star.delay}s infinite`,
              boxShadow: star.size > 2 ? '0 0 6px rgba(0, 207, 255, 0.8)' : undefined,
            }}
          />
        ))}
      </motion.div>

      {/* Stars Layer 2 */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          x: reducedMotion ? 0 : starsParallaxX,
          y: reducedMotion ? 0 : starsParallaxY,
        }}
      >
        {starsLayer2.map((star) => (
          <div
            key={star.id}
            className="absolute rounded-full bg-[#00CFFF]"
            style={{
              top: `${star.top}%`,
              left: `${star.left}%`,
              width: `${star.size}px`,
              height: `${star.size}px`,
              animation: reducedMotion
                ? 'none'
                : `twinkle ${star.dur}s ease-in-out ${star.delay}s infinite`,
              boxShadow: '0 0 8px rgba(0, 207, 255, 0.9)',
            }}
          />
        ))}
      </motion.div>

      {/* Subtle vignette border gradient */}
      <div className="absolute inset-0 pointer-events-none shadow-[inset_0_0_120px_rgba(2,11,24,0.9)]" />
    </div>
  );
};

export default SpaceBackground;
