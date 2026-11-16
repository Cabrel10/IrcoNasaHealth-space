import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FastForward } from 'lucide-react';
import { useMissionStore } from '@/stores/useMissionStore';
import { useReducedMotion } from '@/hooks/useChrono';

export const IntroSequence: React.FC = () => {
  const introDone = useMissionStore((s) => s.introDone);
  const setIntroDone = useMissionStore((s) => s.setIntroDone);
  const reducedMotion = useReducedMotion();

  const [step, setStep] = useState<number>(0);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [progress, setProgress] = useState<number>(0);

  const handleSkip = () => {
    setIntroDone(true);
  };

  useEffect(() => {
    if (reducedMotion || introDone) {
      setIntroDone(true);
      return;
    }

    // Timeline orchestrator
    // t=0.0-0.6s: Black overlay, stars fade in (step 1)
    const t1 = setTimeout(() => setStep(1), 400);

    // t=1.0-2.4s: Title center (step 2)
    const t2 = setTimeout(() => setStep(2), 1000);

    // t=1.6-3.0s: Boot lines & progress bar
    const t3 = setTimeout(() => {
      setStep(3);
      setBootLines((prev) => [...prev, '> Loading configured IRCO demo scenario...']);
    }, 1600);

    const t4 = setTimeout(() => {
      setBootLines((prev) => [...prev, '> Indicator provenance will be shown from API metadata...']);
      setProgress(45);
    }, 1900);

    const t5 = setTimeout(() => {
      setBootLines((prev) => [...prev, '> Demo interface ready; data class is not a live-data claim.']);
      setProgress(100);
    }, 2300);

    // t=3.0-3.4s: Title + boot lines exit
    const t6 = setTimeout(() => setStep(4), 3000);

    // t=3.5-4.5s: Complete intro and unlock HUD
    const t7 = setTimeout(() => {
      setIntroDone(true);
    }, 4500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
      clearTimeout(t7);
    };
  }, [reducedMotion, introDone, setIntroDone]);

  if (introDone) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="intro-overlay"
        initial={{ opacity: 1 }}
        exit={{ opacity: 0, transition: { duration: 0.5, ease: 'easeInOut' } }}
        className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none overflow-hidden bg-black/95 backdrop-blur-3xl pointer-events-auto"
      >
        {/* Skip Button (bottom-right) */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.85 }}
          whileHover={{ opacity: 1, scale: 1.05 }}
          onClick={handleSkip}
          className="absolute bottom-8 right-8 z-50 flex items-center gap-2 rounded-full px-5 py-2 text-xs font-mono tracking-widest text-[#00CFFF] border border-[#00CFFF]/40 bg-[#081A30]/80 backdrop-blur-md shadow-[0_0_15px_rgba(0,207,255,0.3)] hover:bg-[#00CFFF]/20 transition-all cursor-pointer"
        >
          <span>PASSER L'INTRODUCTION</span>
          <FastForward className="w-3.5 h-3.5" />
        </motion.button>

        {/* Central Sequence Content */}
        {step < 4 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -20, filter: 'blur(8px)', transition: { duration: 0.4 } }}
            className="flex flex-col items-center max-w-lg w-full px-6 text-center"
          >
            {/* Logo Emblem */}
            <motion.div
              initial={{ scale: 0, rotate: -45, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-20 h-20 mb-6 flex items-center justify-center"
            >
              <div className="absolute inset-0 rounded-full border border-[#00CFFF]/40 shadow-[0_0_30px_rgba(0,207,255,0.6)] animate-pulse" />
              <div className="absolute inset-2 rounded-full border border-dashed border-[#00CFFF]/60 animate-[spin_30s_linear_infinite]" />
              <svg
                className="w-10 h-10 text-[#00CFFF] drop-shadow-[0_0_12px_#00CFFF]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="3.5" fill="currentColor" fillOpacity="0.3" />
                <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-28 12 12)" />
                <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(32 12 12)" opacity="0.6" />
              </svg>
            </motion.div>

            {/* Title: ICORP */}
            <motion.h1
              initial={{ letterSpacing: '0.6em', filter: 'blur(12px)', opacity: 0 }}
              animate={{ letterSpacing: '0.2em', filter: 'blur(0px)', opacity: 1 }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              className="font-heading text-5xl md:text-6xl font-extrabold tracking-[0.2em] text-white uppercase drop-shadow-[0_0_24px_rgba(0,207,255,0.8)]"
            >
              ICORP
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="mt-3 font-heading text-sm md:text-base font-medium tracking-[0.25em] text-[#8ea4bf] uppercase"
            >
              SpaceMed — Mission Health Monitor
            </motion.p>

            {/* Cyan Accent Line drawing under */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.4, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="w-48 h-0.5 bg-gradient-to-r from-transparent via-[#00CFFF] to-transparent my-6 shadow-[0_0_10px_#00CFFF]"
            />

            {/* Telemetry Boot log lines */}
            <div className="w-full h-24 flex flex-col items-start font-mono text-xs text-[#00CFFF]/90 text-left space-y-1.5 pl-4">
              {bootLines.map((line, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2"
                >
                  <span className="text-[#3DDC84]">✔</span>
                  <span>{line}</span>
                </motion.div>
              ))}
            </div>

            {/* Telemetry Progress Bar */}
            <div className="w-full bg-[#081A30] h-1.5 rounded-full overflow-hidden border border-[#00CFFF]/30 mt-2 shadow-[0_0_10px_rgba(0,207,255,0.2)]">
              <motion.div
                className="h-full bg-gradient-to-r from-[#00CFFF] via-[#38BDF8] to-[#3DDC84]"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeInOut' }}
              />
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default IntroSequence;
