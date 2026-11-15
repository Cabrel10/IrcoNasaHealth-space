import React, { useState, useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import {
  Heart,
  Droplets,
  Activity,
  Thermometer,
  Moon,
  Shield,
  Zap,
  Radio,
  Clock,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

import { useMissionStore } from '@/stores/useMissionStore';
import { CREW_MEMBERS, VITALS_CARDS, type CrewMember, type VitalCard } from '@/constants/metrics';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { RingGauge } from '@/components/ui/RingGauge';
import { Sparkline } from '@/components/ui/Sparkline';
import { useReducedMotion } from '@/hooks/useChrono';

export const CrewHealthView: React.FC = () => {
  const { selectedCrewId, setSelectedCrew, setSelectedMetric, setActiveNav } = useMissionStore();
  const reducedMotion = useReducedMotion();

  const [activeZone, setActiveZone] = useState<'cardiac' | 'cranial' | 'pulmonary' | null>(null);
  const [bodyFlash, setBodyFlash] = useState(false);

  // Mouse tilt on holographic body
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const smoothX = useSpring(mouseX, { stiffness: 50, damping: 18 });
  const smoothY = useSpring(mouseY, { stiffness: 50, damping: 18 });
  const tiltY = useTransform(smoothX, [-0.5, 0.5], [-6, 6]);
  const tiltX = useTransform(smoothY, [-0.5, 0.5], [3, -3]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (reducedMotion) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(nx);
    mouseY.set(ny);
  };

  const handleSelectCrew = (member: CrewMember) => {
    setSelectedCrew(member.id);
    setBodyFlash(true);
    setTimeout(() => setBodyFlash(false), 400);
  };

  const handleVitalCardClick = (metricId: string) => {
    setSelectedMetric(metricId);
    setActiveNav('mission-overview');
  };

  // Selected crew member object
  const currentCrew = CREW_MEMBERS.find((m) => m.id === selectedCrewId) || CREW_MEMBERS[0];

  // Muscle & Bone Loss Chart Data
  const muscleBoneData = [
    { day: 'D1', muscle: 100, bone: 100 },
    { day: 'D30', muscle: 98, bone: 99 },
    { day: 'D60', muscle: 96, bone: 98 },
    { day: 'D90', muscle: 94, bone: 97 },
    { day: 'D120', muscle: 92, bone: 96 },
    { day: 'D137', muscle: 91, bone: 95.5 },
  ];

  const getVitalIcon = (name: string) => {
    switch (name) {
      case 'Heart':
        return <Heart className="w-4 h-4 text-[#FF2D55] animate-pulse" />;
      case 'Droplets':
        return <Droplets className="w-4 h-4 text-[#00CFFF]" />;
      case 'Activity':
        return <Activity className="w-4 h-4 text-[#22C55E]" />;
      case 'Thermometer':
        return <Thermometer className="w-4 h-4 text-[#F59E0B]" />;
      case 'Moon':
        return <Moon className="w-4 h-4 text-[#A78BFA]" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-72px)] flex flex-col justify-between p-4 lg:p-6 overflow-hidden select-none">
      
      {/* Top Banner (Medical Truth Rule) */}
      <div className="flex items-center justify-between z-20 px-2 -mb-1">
        <div className="flex items-center gap-2">
          <StatusPill label="DATA: SYNTHETIC / SIMULATED" variant="synthetic" showDot />
          <StatusPill label="THRESHOLD: ILLUSTRATIVE" variant="provisional" showDot />
        </div>
        <div className="text-[11px] font-mono text-cyan-400/80 bg-[#081A30]/80 px-3 py-1 rounded-full border border-[#00CFFF]/25">
          Aide à la décision, pas un diagnostic.
        </div>
      </div>

      {/* ─── Upper Grid: Left Crew List, Center Hologram, Right 5 Vitals ────── */}
      <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-[250px_1fr_310px] xl:grid-cols-[270px_1fr_330px] gap-6 items-center min-h-0 py-2">

        {/* 1. Left Panel: Crew Member Selection */}
        <div className="h-full max-h-[460px] flex flex-col justify-between z-20">
          <GlassCard padding="md" className="h-full flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#00CFFF]/20">
                <span className="font-heading font-bold text-sm tracking-wider uppercase text-white">
                  Équipage Apollo-7
                </span>
                <span className="text-xs font-mono text-[#00CFFF]">4 Membres</span>
              </div>

              <div className="flex flex-col gap-2.5 mt-3">
                {CREW_MEMBERS.map((member) => {
                  const isSelected = member.id === selectedCrewId;

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => handleSelectCrew(member)}
                      className={`w-full flex items-center justify-between p-2.5 rounded-2xl text-left transition-all duration-200 group ${
                        isSelected
                          ? 'bg-[#00CFFF]/20 border-l-4 border-l-[#00CFFF] border border-[#00CFFF]/40 shadow-[0_0_15px_rgba(0,207,255,0.25)]'
                          : 'bg-[#081A30]/50 border border-white/10 hover:bg-white/5 hover:border-[#00CFFF]/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Avatar ring */}
                        <div
                          className="relative flex items-center justify-center w-9 h-9 rounded-full border-2 text-xs font-mono font-bold"
                          style={{
                            borderColor: member.statusColor,
                            color: member.statusColor,
                            boxShadow: `0 0 10px ${member.statusColor}50`,
                          }}
                        >
                          {member.initials}
                        </div>
                        <div className="leading-tight">
                          <div className="font-heading text-xs font-bold text-white group-hover:text-[#00CFFF] transition-colors">
                            {member.name}
                          </div>
                          <div className="text-[10px] font-mono text-[#94b0d1]">
                            {member.role}
                          </div>
                        </div>
                      </div>

                      <StatusPill
                        label={member.status === 'healthy' ? 'OK' : 'ATTN'}
                        variant={member.status === 'healthy' ? 'nominal' : 'warning'}
                        showDot
                      />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Member Quick Bio Info */}
            <div className="p-3 rounded-xl bg-white/5 border border-[#00CFFF]/20 text-[11px] font-mono space-y-1">
              <div className="text-[#00CFFF] font-bold">SUJET: {currentCrew.name}</div>
              <div className="text-gray-300">Statut: Bio-télémétrie connectée</div>
              <div className="text-gray-400">Mission Day: MET 137</div>
            </div>
          </GlassCard>
        </div>

        {/* 2. Center: Holographic Human Body & Floating Callouts */}
        <div
          className="relative w-full h-full flex items-center justify-center min-h-[380px]"
          onMouseMove={handleMouseMove}
          style={{ perspective: 1000 }}
        >
          {/* Concentric Rotating Holographic Background Rings */}
          <div className="absolute w-[440px] h-[440px] rounded-full border border-[#00CFFF]/15 animate-[spin_60s_linear_infinite] pointer-events-none" />
          <div className="absolute w-[360px] h-[360px] rounded-full border border-dashed border-[#00CFFF]/25 animate-[spin_40s_linear_infinite_reverse] pointer-events-none" />

          {/* Dotted Grid Floor (rotateX 70deg) */}
          <div
            className="absolute bottom-4 w-[420px] h-[160px] rounded-full border border-[#00CFFF]/20 shadow-[0_0_30px_rgba(0,207,255,0.2)] pointer-events-none"
            style={{
              transform: 'rotateX(70deg)',
              background: 'radial-gradient(ellipse at center, rgba(0,207,255,0.15) 0%, transparent 70%)',
            }}
          />

          {/* Holographic Body Container (floating and mouse tilting) */}
          <motion.div
            className="relative flex items-center justify-center select-none"
            style={{
              rotateY: reducedMotion ? 0 : tiltY,
              rotateX: reducedMotion ? 0 : tiltX,
            }}
            animate={{
              y: reducedMotion ? 0 : [0, -8, 0],
              opacity: bodyFlash ? 0.4 : 1,
            }}
            transition={{
              y: { duration: 5, repeat: Infinity, ease: 'easeInOut' },
              opacity: { duration: 0.2 },
            }}
          >
            {/* SVG Holographic Human Body Silhouette */}
            <div className="relative w-52 h-[340px] flex items-center justify-center">
              <svg
                viewBox="0 0 200 360"
                className="w-full h-full filter drop-shadow-[0_0_15px_rgba(0,207,255,0.7)]"
                fill="none"
              >
                {/* Body Outlines & Anatomy Geometry */}
                {/* Head */}
                <circle
                  cx="100"
                  cy="42"
                  r="24"
                  stroke="#00CFFF"
                  strokeWidth="2"
                  fill="rgba(0,207,255,0.06)"
                  className="cursor-pointer hover:stroke-white transition-colors"
                  onMouseEnter={() => setActiveZone('cranial')}
                  onMouseLeave={() => setActiveZone(null)}
                />
                {/* Neck */}
                <path d="M 94 66 L 94 76 M 106 66 L 106 76" stroke="#00CFFF" strokeWidth="2" />

                {/* Torso & Ribcage */}
                <path
                  d="M 68 84 L 132 84 L 122 170 L 100 185 L 78 170 Z"
                  stroke="#00CFFF"
                  strokeWidth="2"
                  fill="rgba(0,207,255,0.05)"
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveZone('cardiac')}
                  onMouseLeave={() => setActiveZone(null)}
                />

                {/* Chest contours */}
                <path d="M 75 105 Q 100 120 125 105" stroke="#00CFFF" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M 80 125 Q 100 140 120 125" stroke="#00CFFF" strokeWidth="1" strokeDasharray="3 3" />
                <path d="M 85 145 Q 100 155 115 145" stroke="#00CFFF" strokeWidth="1" strokeDasharray="3 3" />

                {/* Arms */}
                {/* Left arm */}
                <path d="M 68 84 L 46 140 L 36 200" stroke="#00CFFF" strokeWidth="2" strokeLinecap="round" />
                {/* Right arm */}
                <path d="M 132 84 L 154 140 L 164 200" stroke="#00CFFF" strokeWidth="2" strokeLinecap="round" />

                {/* Legs */}
                {/* Left leg */}
                <path d="M 85 180 L 78 260 L 72 340" stroke="#00CFFF" strokeWidth="2.2" strokeLinecap="round" />
                {/* Right leg */}
                <path d="M 115 180 L 122 260 L 128 340" stroke="#00CFFF" strokeWidth="2.2" strokeLinecap="round" />

                {/* Joint Markers */}
                <circle cx="46" cy="140" r="3" fill="#00CFFF" />
                <circle cx="154" cy="140" r="3" fill="#00CFFF" />
                <circle cx="78" cy="260" r="3" fill="#00CFFF" />
                <circle cx="122" cy="260" r="3" fill="#00CFFF" />

                {/* Pulsing Red Heart in Chest */}
                <g
                  transform="translate(94, 110)"
                  className="cursor-pointer"
                  onMouseEnter={() => setActiveZone('cardiac')}
                  onMouseLeave={() => setActiveZone(null)}
                >
                  <circle r="8" fill="#FF2D55" className="animate-ping opacity-75" />
                  <circle r="5" fill="#FF2D55" stroke="#fff" strokeWidth="1" />
                </g>
              </svg>

              {/* Layer 3: Vertical Sweeping SCAN LINE with Gradient */}
              <div
                className="absolute inset-x-0 h-8 pointer-events-none bg-gradient-to-b from-transparent via-[#00CFFF]/45 to-transparent animate-scan"
                style={{
                  filter: 'blur(2px)',
                }}
              />
            </div>

            {/* ─── Floating Callout 1: Cardiac Activity (Left) ──────────────── */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -left-36 top-16 z-30"
            >
              <GlassCard padding="sm" className="w-44 border-[#FF2D55]/50 bg-[#081A30]/85">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#FF2D55] font-bold">
                  <Heart className="w-3.5 h-3.5 animate-pulse" />
                  <span>ACTIVITÉ CARDIAQUE</span>
                </div>
                <div className="text-base font-heading font-extrabold text-white mt-0.5">
                  68 <span className="text-[10px] font-mono text-gray-400">BPM</span>
                </div>
                <div className="text-[9px] font-mono text-[#22C55E]">Rythme sinusal régulier</div>
              </GlassCard>

              {/* SVG Connector line to chest */}
              <svg className="absolute -right-8 top-1/2 w-10 h-10 overflow-visible pointer-events-none">
                <path d="M 0 0 L 32 20" stroke="#FF2D55" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx="32" cy="20" r="2.5" fill="#FF2D55" className="animate-ping" />
              </svg>
            </motion.div>

            {/* ─── Floating Callout 2: Body Status: Stable (Right) ──────────── */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 }}
              className="absolute -right-36 top-32 z-30"
            >
              <GlassCard padding="sm" className="w-44 border-[#00CFFF]/50 bg-[#081A30]/85">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#00CFFF] font-bold">
                  <Shield className="w-3.5 h-3.5" />
                  <span>ÉTAT PHYSIOLOGIQUE</span>
                </div>
                <div className="text-sm font-heading font-bold text-[#22C55E] mt-0.5">
                  STABLE (98.4%)
                </div>
                <div className="text-[9px] font-mono text-gray-400">Aucune anomalie critique</div>
              </GlassCard>

              {/* SVG Connector line to body */}
              <svg className="absolute -left-8 top-1/2 w-10 h-10 overflow-visible pointer-events-none">
                <path d="M 32 0 L 0 10" stroke="#00CFFF" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx="0" cy="10" r="2.5" fill="#00CFFF" />
              </svg>
            </motion.div>
          </motion.div>
        </div>

        {/* 3. Right Panel: 5 Stacked Vitals Cards */}
        <div className="h-full max-h-[460px] flex flex-col justify-between z-20 gap-2">
          {VITALS_CARDS.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <GlassCard
                padding="sm"
                onClick={() => handleVitalCardClick(card.id)}
                className="cursor-pointer hover:-translate-x-1.5 transition-all duration-200 border-[#00CFFF]/30 hover:border-[#00CFFF] group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="p-1.5 rounded-lg border border-white/10"
                      style={{ backgroundColor: `${card.color}20`, color: card.color }}
                    >
                      {getVitalIcon(card.iconName)}
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase text-[#94b0d1] group-hover:text-white transition-colors">
                        {card.label}
                      </div>
                      <div className="flex items-baseline gap-1">
                        <span className="font-heading text-base font-extrabold text-white">
                          {card.value}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">{card.unit}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Sparkline data={card.history} color={card.color} width={65} height={20} />
                    <ChevronRight className="w-3.5 h-3.5 text-[#00CFFF] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>

      {/* ─── Bottom Row: Radiation, Muscle/Bone, Hydration, Stress, Timeline ─ */}
      <div className="relative z-20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
        
        {/* 1. Radiation Gauge (Semicircle 12.4 / 30 mSv) */}
        <GlassCard padding="sm" className="flex flex-col items-center justify-center text-center">
          <RingGauge value={12.4} max={30} size={70} strokeWidth={6} color="#F59E0B" semi unit="mSv" />
          <div className="text-[10px] font-mono text-[#94b0d1] uppercase mt-1">Dose Radiation</div>
          <div className="text-[9px] font-mono text-[#22C55E]">12.4 / 30 mSv (Seuil sûr)</div>
        </GlassCard>

        {/* 2. Muscle & Bone Loss Chart (Recharts) */}
        <GlassCard padding="sm" className="flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#94b0d1]">
            <span>Densité Musculaire/Osseuse</span>
            <span className="text-[#A78BFA] font-bold">-4.5%</span>
          </div>
          <div className="h-14 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={muscleBoneData}>
                <XAxis dataKey="day" hide />
                <YAxis hide domain={[90, 102]} />
                <Tooltip
                  content={({ payload }) => (
                    <div className="bg-[#081A30] border border-[#00CFFF]/40 p-1 rounded text-[10px] font-mono text-white">
                      {payload && payload[0] && `${payload[0].value}%`}
                    </div>
                  )}
                />
                <Line type="monotone" dataKey="muscle" stroke="#A78BFA" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="bone" stroke="#00CFFF" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-between text-[9px] font-mono text-gray-400">
            <span className="text-[#A78BFA]">■ Muscle</span>
            <span className="text-[#00CFFF]">■ Os</span>
          </div>
        </GlassCard>

        {/* 3. Hydration Ring (78%) */}
        <GlassCard padding="sm" className="flex flex-col items-center justify-center">
          <RingGauge value={78} max={100} size={60} strokeWidth={5} color="#00CFFF" label="Hydratation" />
          <div className="text-[9px] font-mono text-[#22C55E] mt-0.5">Équilibre optimal</div>
        </GlassCard>

        {/* 4. Stress Ring (22 / 100) */}
        <GlassCard padding="sm" className="flex flex-col items-center justify-center">
          <RingGauge value={22} max={100} size={60} strokeWidth={5} color="#F59E0B" label="Niveau Stress" unit="/100" />
          <div className="text-[9px] font-mono text-[#22C55E] mt-0.5">Faible · Nominal</div>
        </GlassCard>

        {/* 5. Mission Timeline (D+137 to D+142) */}
        <GlassCard padding="sm" className="col-span-2 md:col-span-1 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#94b0d1]">
            <span>Timeline Mission</span>
            <span className="text-[#00CFFF] font-bold">D+137</span>
          </div>

          <div className="relative flex items-center justify-between my-2 px-1">
            <div className="absolute inset-x-2 h-0.5 bg-white/10" />
            {[137, 138, 139, 140, 141, 142].map((day, idx) => (
              <div key={day} className="relative z-10 flex flex-col items-center">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    idx === 0
                      ? 'bg-[#00CFFF] ring-4 ring-[#00CFFF]/30 shadow-[0_0_8px_#00CFFF]'
                      : 'bg-white/20'
                  }`}
                />
                <span className="text-[9px] font-mono text-gray-400 mt-1">D{day}</span>
              </div>
            ))}
          </div>

          <div className="text-[9px] font-mono text-center text-[#22C55E]">
            Prochaine rotation EVA: D+139
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default CrewHealthView;
