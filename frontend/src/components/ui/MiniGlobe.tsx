import React from 'react';
import { motion } from 'framer-motion';
import earthBg from '@/assets/backgrounds/earth-orbit-bg.jpg';
import miniGlobeImg from '@/assets/illustrations/globe-orbit-mini.png';
import { useReducedMotion } from '@/hooks/useChrono';

interface MiniGlobeProps {
  className?: string;
  size?: number;
}

export const MiniGlobe: React.FC<MiniGlobeProps> = ({ className = '', size = 72 }) => {
  const reducedMotion = useReducedMotion();

  return (
    <div className={`relative flex items-center gap-3 select-none ${className}`} aria-label="Earth illustration; mission trajectory unavailable">
      {/* Outer orbit container */}
      <div 
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        {/* Orbital Track ring */}
        <div className={`absolute inset-[-6px] rounded-full border border-[#00CFFF]/20 border-dashed ${reducedMotion ? '' : 'animate-[spin_40s_linear_infinite]'}`} />
        
        {/* Orbiting Satellite Dot */}
        <motion.div
          className="absolute inset-[-10px] pointer-events-none"
          animate={reducedMotion ? { rotate: 0 } : { rotate: 360 }}
          transition={{ duration: 12, repeat: reducedMotion ? 0 : Infinity, ease: 'linear' }}
        >
          <div className="w-2 h-2 rounded-full bg-[#00CFFF] shadow-[0_0_8px_#00CFFF] relative top-0 left-1/2 -translate-x-1/2" />
        </motion.div>

        {/* Globe Sphere */}
        <div 
          className="relative rounded-full overflow-hidden shadow-[0_0_20px_rgba(0,207,255,0.45),inset_0_0_15px_rgba(0,0,0,0.8)] border border-[#00CFFF]/40"
          style={{
            width: size,
            height: size,
            backgroundImage: `url(${miniGlobeImg}), url(${earthBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {/* Sphere light/shadow gradient overlay */}
          <div 
            className="absolute inset-0 pointer-events-none rounded-full"
            style={{
              background: 'radial-gradient(circle at 35% 35%, rgba(0, 207, 255, 0.25) 0%, rgba(2, 11, 24, 0.4) 60%, rgba(2, 11, 24, 0.95) 100%)',
              boxShadow: 'inset -8px -8px 16px rgba(0,0,0,0.8), inset 4px 4px 10px rgba(0,207,255,0.3)',
            }}
          />
        </div>
      </div>

      {/* Orbit Tag text */}
      <div className="flex flex-col">
        <span className="text-[10px] font-mono tracking-widest text-[#00CFFF] uppercase font-semibold drop-shadow-[0_0_6px_rgba(0,207,255,0.6)]">
          TERRE · ILLUSTRATION
        </span>
        <span className="text-[11px] font-mono text-[#94b0d1]">
          Trajectoire: UNAVAILABLE
        </span>
      </div>
    </div>
  );
};

export default MiniGlobe;
