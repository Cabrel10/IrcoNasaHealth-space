import React, { useEffect, useState } from 'react';
import { useReducedMotion } from '@/hooks/useChrono';

interface CountUpProps {
  end: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export const CountUp: React.FC<CountUpProps> = ({
  end,
  duration = 0.9,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
}) => {
  const reducedMotion = useReducedMotion();
  const [val, setVal] = useState(reducedMotion ? end : 0);

  useEffect(() => {
    if (reducedMotion) {
      setVal(end);
      return;
    }

    let start = 0;
    const startTime = performance.now();
    const durMs = duration * 1000;

    let animId: number;
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durMs, 1);
      // easeOut cubic [0.16, 1, 0.3, 1] approximation
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * ease;
      setVal(current);

      if (progress < 1) {
        animId = requestAnimationFrame(step);
      } else {
        setVal(end);
      }
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [end, duration, reducedMotion]);

  return (
    <span className={className}>
      {prefix}
      {val.toFixed(decimals)}
      {suffix}
    </span>
  );
};

export default CountUp;
