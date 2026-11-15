// ─── Motion Configuration ───────────────────────────────────────────────────
// All durations, easings, and delays centralized here.

export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
export const EASE_IN_OUT: [number, number, number, number] = [0.65, 0, 0.35, 1];

export const SPRING_SNAP = { stiffness: 120, damping: 18 };
export const SPRING_CARD = { stiffness: 90, damping: 16 };
export const SPRING_PARALLAX = { stiffness: 50, damping: 20 };

export const INTRO_TIMING = {
  starsIn: { start: 0, dur: 0.6 },
  earthRise: { start: 0.4, dur: 1.6 },
  titleIn: { start: 1.0, dur: 1.4 },
  bootLines: { start: 1.6, dur: 1.4 },
  titleExit: { start: 3.0, dur: 0.4 },
  hudAssembly: { start: 3.2, dur: 1.3 },
  total: 4.5,
} as const;

export const CYLINDER = {
  cardCount: 6,
  angleStep: 60,
  translateZ: 260,
  idleSway: { degrees: 5, duration: 6 },
  autoAdvanceInterval: 8000,
  resumeAfterIdle: 10000,
} as const;

export const VIEW_TRANSITION = {
  exitDuration: 0.5,
  enterDuration: 0.8,
  stagger: { kpi: 0.1, navItem: 0.07, crewVital: 0.08, bottomRow: 0.1 },
} as const;

export const FLOAT_ANIM = {
  y: [0, -10, 0],
  duration: 6,
  ease: EASE_IN_OUT,
} as const;

export const HEARTBEAT = {
  scale: [1, 1.15, 1],
  duration: 0.8,
} as const;

export const SCAN_LINE = {
  duration: 4,
  ease: EASE_IN_OUT,
} as const;
