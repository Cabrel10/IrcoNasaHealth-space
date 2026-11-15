import React from 'react';

export interface GlassCardProps {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  onClick?: () => void;
  style?: React.CSSProperties;
}

const paddingMap: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  active = false,
  className = '',
  padding = 'md',
  onClick,
  style,
}) => {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`relative overflow-hidden rounded-2xl md:rounded-3xl transition-all duration-300 ${paddingMap[padding]} ${
        active
          ? 'bg-[#081A30]/85 border-[#00CFFF] shadow-[inset_0_0_25px_rgba(0,207,255,0.25),0_8px_36px_rgba(0,207,255,0.2)]'
          : 'bg-[#081A30]/60 border-[#00CFFF]/30 shadow-[inset_0_0_20px_rgba(0,207,255,0.12),0_8px_32px_rgba(0,0,0,0.6)] hover:border-[#00CFFF]/50'
      } border backdrop-blur-2xl ${className}`}
    >
      {/* Top subtle highlight reflection */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[1px] z-10"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.45) 50%, transparent 100%)',
        }}
      />

      {children}
    </div>
  );
};

export default GlassCard;
