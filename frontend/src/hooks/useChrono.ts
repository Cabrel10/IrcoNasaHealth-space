import { useEffect, useState } from 'react';
import { useMissionStore } from '@/stores/useMissionStore';

export function useChrono() {
  const chronoSeconds = useMissionStore((s) => s.chronoSeconds);
  const tickChrono = useMissionStore((s) => s.tickChrono);

  useEffect(() => {
    const timer = setInterval(tickChrono, 1000);
    return () => clearInterval(timer);
  }, [tickChrono]);

  const h = Math.floor(chronoSeconds / 3600);
  const m = Math.floor((chronoSeconds % 3600) / 60);
  const s = chronoSeconds % 60;

  const tPlus = `T+ ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const days = Math.floor(chronoSeconds / 86400);
  const hh = Math.floor((chronoSeconds % 86400) / 3600);
  const mm = Math.floor((chronoSeconds % 3600) / 60);
  const ss = chronoSeconds % 60;
  const met = `${String(days).padStart(3, '0')}:${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  return { tPlus, met, chronoSeconds };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return reduced;
}
