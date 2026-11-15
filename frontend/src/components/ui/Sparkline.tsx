import React, { useId } from 'react';
import { motion } from 'framer-motion';

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  showDot?: boolean;
  strokeWidth?: number;
  className?: string;
  fillGradient?: boolean;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  color = '#00CFFF',
  width = 120,
  height = 36,
  showDot = true,
  strokeWidth = 2,
  className = '',
  fillGradient = true,
}) => {
  const gradientId = useId();

  if (!data || data.length < 2) {
    return (
      <div 
        className={`flex items-center justify-center text-[10px] text-gray-500 font-mono ${className}`}
        style={{ width, height }}
      >
        — no_data —
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max === min ? 1 : max - min;
  const paddingY = 4;
  const usableHeight = height - paddingY * 2;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * (width - 4) + 2;
    const y = height - paddingY - ((val - min) / range) * usableHeight;
    return { x, y };
  });

  const pathD = points.reduce((acc, pt, i) => `${acc} ${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`, '');
  const areaD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;
  const lastPoint = points[points.length - 1];

  return (
    <svg width={width} height={height} className={`overflow-visible ${className}`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {fillGradient && (
        <path d={areaD} fill={`url(#${gradientId})`} />
      )}

      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />

      {showDot && lastPoint && (
        <g transform={`translate(${lastPoint.x}, ${lastPoint.y})`}>
          <circle r="4" fill={color} className="animate-ping opacity-60" />
          <circle r="2.5" fill={color} stroke="#020B18" strokeWidth="1.5" />
        </g>
      )}
    </svg>
  );
};

export default Sparkline;
