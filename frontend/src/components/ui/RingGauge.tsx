import React from 'react';
import { motion } from 'framer-motion';

interface RingGaugeProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  unit?: string;
  semi?: boolean;
  className?: string;
}

export const RingGauge: React.FC<RingGaugeProps> = ({
  value,
  max = 100,
  size = 76,
  strokeWidth = 6,
  color = '#00CFFF',
  label,
  unit = '%',
  semi = false,
  className = '',
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const clamped = Math.min(Math.max(value, 0), max);
  const ratio = clamped / max;

  if (semi) {
    // Semi-circle (180 deg)
    const arcLength = Math.PI * radius;
    const strokeDashoffset = arcLength * (1 - ratio);

    return (
      <div className={`relative flex flex-col items-center justify-center select-none ${className}`}>
        <svg width={size} height={size / 2 + strokeWidth + 4} className="overflow-visible">
          {/* Background Arc */}
          <path
            d={`M ${strokeWidth} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${size / 2}`}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Animated Value Arc */}
          <motion.path
            d={`M ${strokeWidth} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth} ${size / 2}`}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={arcLength}
            initial={{ strokeDashoffset: arcLength }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>
        <div className="text-center -mt-4">
          <div className="font-heading font-bold text-sm tracking-tight text-white">
            {value} <span className="text-[10px] text-gray-400 font-mono">{unit}</span>
          </div>
          {label && <div className="text-[10px] text-[#94b0d1] uppercase tracking-wider font-mono">{label}</div>}
        </div>
      </div>
    );
  }

  // Full Circle
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - ratio);

  return (
    <div className={`relative flex flex-col items-center justify-center select-none ${className}`}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90 overflow-visible">
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-heading font-bold text-xs tracking-tight text-white">
            {value}
            <span className="text-[9px] text-[#00CFFF]/80 font-mono ml-0.5">{unit}</span>
          </span>
        </div>
      </div>

      {label && (
        <span className="text-[10px] text-[#94b0d1] font-mono uppercase tracking-wider mt-1 text-center">
          {label}
        </span>
      )}
    </div>
  );
};

export default RingGauge;
