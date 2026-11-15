import React from 'react';
import { Check, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export type StatusVariant =
  | 'nominal'
  | 'active'
  | 'warning'
  | 'critical'
  | 'info'
  | 'synthetic'
  | 'measured'
  | 'provisional'
  | 'nodata';

export interface StatusPillProps {
  label: string;
  variant?: StatusVariant;
  showCheck?: boolean;
  showDot?: boolean;
  pulseDot?: boolean;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  label,
  variant = 'nominal',
  showCheck = false,
  showDot = true,
  pulseDot = false,
  className = '',
}) => {
  let textColor = 'text-[#22C55E]';
  let bgColor = 'bg-[#22C55E]/15';
  let borderColor = 'border-[#22C55E]/40';
  let dotBg = 'bg-[#22C55E]';

  switch (variant) {
    case 'active':
    case 'measured':
      textColor = 'text-[#00CFFF]';
      bgColor = 'bg-[#00CFFF]/15';
      borderColor = 'border-[#00CFFF]/45';
      dotBg = 'bg-[#00CFFF]';
      break;
    case 'warning':
      textColor = 'text-[#F59E0B]';
      bgColor = 'bg-[#F59E0B]/15';
      borderColor = 'border-[#F59E0B]/40';
      dotBg = 'bg-[#F59E0B]';
      break;
    case 'critical':
      textColor = 'text-[#FF2D55]';
      bgColor = 'bg-[#FF2D55]/15';
      borderColor = 'border-[#FF2D55]/45';
      dotBg = 'bg-[#FF2D55]';
      break;
    case 'info':
    case 'synthetic':
      textColor = 'text-[#A78BFA]';
      bgColor = 'bg-[#A78BFA]/15';
      borderColor = 'border-[#A78BFA]/35';
      dotBg = 'bg-[#A78BFA]';
      break;
    case 'provisional':
      textColor = 'text-[#38BDF8]';
      bgColor = 'bg-[#0284C7]/20';
      borderColor = 'border-[#38BDF8]/40';
      dotBg = 'bg-[#38BDF8]';
      break;
    case 'nodata':
      textColor = 'text-gray-400';
      bgColor = 'bg-white/5';
      borderColor = 'border-white/15';
      dotBg = 'bg-gray-400';
      break;
    case 'nominal':
    default:
      textColor = 'text-[#22C55E]';
      bgColor = 'bg-[#22C55E]/15';
      borderColor = 'border-[#22C55E]/40';
      dotBg = 'bg-[#22C55E]';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono uppercase tracking-wider border backdrop-blur-md transition-all duration-200 select-none ${textColor} ${bgColor} ${borderColor} ${className}`}
    >
      {showCheck && <Check className="w-3 h-3 stroke-[2.5]" />}
      {variant === 'warning' && !showCheck && !showDot && <AlertTriangle className="w-3 h-3 stroke-[2]" />}
      {variant === 'critical' && !showCheck && !showDot && <AlertCircle className="w-3 h-3 stroke-[2]" />}
      {variant === 'provisional' && !showCheck && !showDot && <Info className="w-3 h-3 stroke-[2]" />}
      
      {showDot && !showCheck && (
        <span className="relative flex h-1.5 w-1.5 items-center justify-center">
          {pulseDot && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${dotBg} opacity-75`} />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotBg} shadow-[0_0_6px_currentColor]`} />
        </span>
      )}
      <span>{label}</span>
    </span>
  );
};

export default StatusPill;
