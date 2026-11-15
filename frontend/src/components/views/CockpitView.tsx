import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Droplets,
  Activity,
  Thermometer,
  Wind,
  Brain,
  Moon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Info,
  CheckCircle2,
  X,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';

import { useMissionStore } from '@/stores/useMissionStore';
import { CYLINDER_METRICS, INDICATOR_IDS, type CylinderMetric } from '@/constants/metrics';
import {
  buildIndicatorMap,
  metricValueText,
  metricHistory as historyOf,
  metricStatusVariant as statusVariantOf,
  metricStatusText as statusTextOf,
  metricBaseline as baselineOf,
  metricBaselineSd as baselineSdOf,
  globalLevelView,
} from '@/services/dashboardValues';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { RingGauge } from '@/components/ui/RingGauge';
import { Sparkline } from '@/components/ui/Sparkline';
import { MiniGlobe } from '@/components/ui/MiniGlobe';
import { useReducedMotion } from '@/hooks/useChrono';
import { SPRING_SNAP } from '@/constants/motion';
import astronautImg from '@/assets/hero.png';

export const CockpitView: React.FC = () => {
  const {
    selectedMetricId,
    setSelectedMetric,
    setActiveNav,
    dashboard,
    dashboardStatus,
    dashboardDay,
    setDashboardDay,
  } = useMissionStore();
  const reducedMotion = useReducedMotion();

  // Cylinder state: current index 0..5
  const [currentIndex, setCurrentIndex] = useState(0);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Sync selected metric when currentIndex changes
  useEffect(() => {
    const metric = CYLINDER_METRICS[currentIndex];
    if (metric) {
      setSelectedMetric(metric.id);
    }
  }, [currentIndex, setSelectedMetric]);

  // Rotate to specific index
  const rotateToIndex = useCallback((newIdx: number) => {
    const total = CYLINDER_METRICS.length;
    const normalizedIdx = (newIdx % total + total) % total;
    setCurrentIndex(normalizedIdx);
    setRotationAngle(-normalizedIdx * 60);
  }, []);

  const handleNext = useCallback(() => {
    rotateToIndex(currentIndex + 1);
  }, [currentIndex, rotateToIndex]);

  const handlePrev = useCallback(() => {
    rotateToIndex(currentIndex - 1);
  }, [currentIndex, rotateToIndex]);

  // Auto-advance every 8s when not hovered or reduced motion
  useEffect(() => {
    if (isHovered || reducedMotion) return;
    const timer = setInterval(() => {
      handleNext();
    }, 8000);
    return () => clearInterval(timer);
  }, [isHovered, reducedMotion, handleNext]);

  // Keyboard navigation (left / right arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev]);

  // Wheel scroll on cylinder
  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) > 20 || Math.abs(e.deltaX) > 20) {
      if (e.deltaY > 0 || e.deltaX > 0) handleNext();
      else handlePrev();
    }
  };

  // Live jitter (fake fluctuation) removed: values come from the IRCO API only.

  // Current metric data for right panel
  const activeMetric: CylinderMetric =
    CYLINDER_METRICS.find((m) => m.id === selectedMetricId) || CYLINDER_METRICS[0];

  // ─── Real backend resolution (shared module, single source of truth) ──────
  const indicatorMap = buildIndicatorMap(dashboard?.indicators);
  const level = dashboard?.global?.level ?? 'no_data';
  const { text: levelText, variant: globalVariant } = globalLevelView(dashboard?.global?.level);

  const resolveMetric = (metricId: string) => ({ text: metricValueText(indicatorMap, metricId) });
  const metricHistory = (metricId: string) => historyOf(indicatorMap, metricId);
  const indicatorStatusVariant = (metricId: string) => statusVariantOf(indicatorMap, metricId);
  const metricStatusText = (metricId: string) => statusTextOf(indicatorMap, metricId);
  const metricBaseline = (metricId: string) => baselineOf(indicatorMap, metricId);
  const metricBaselineSd = (metricId: string) => baselineSdOf(indicatorMap, metricId);

  const spo2Metric = resolveMetric('spo2');
  const tempMetric = resolveMetric('body-temp');
  const sleeping = dashboardStatus === 'loading';
  const backendDown = dashboardStatus === 'error';

  // Helper for metric icons
  const getMetricIcon = (name: string, className = 'w-6 h-6') => {
    switch (name) {
      case 'Heart':
        return <Heart className={className} />;
      case 'Droplets':
        return <Droplets className={className} />;
      case 'Activity':
        return <Activity className={className} />;
      case 'Thermometer':
        return <Thermometer className={className} />;
      case 'Wind':
        return <Wind className={className} />;
      case 'Brain':
        return <Brain className={className} />;
      case 'Moon':
        return <Moon className={className} />;
      default:
        return <Activity className={className} />;
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-72px)] flex flex-col justify-between p-4 lg:p-6 overflow-hidden select-none">
      {/* Top Banner (Medical Truth Rule) */}
      <div className="flex items-center justify-between z-20 px-2 -mb-2">
        <div className="flex items-center gap-2">
          {backendDown ? (
            <StatusPill label="BACKEND UNAVAILABLE" variant="critical" showDot />
          ) : (
            <>
              <StatusPill
                label={`DATA: ${(dashboard?.data_class ?? '…').toUpperCase()}`}
                variant="synthetic"
                showDot
              />
              <StatusPill label={`GLOBAL: ${level.toUpperCase()}`} variant={globalVariant} showDot />
            </>
          )}
          <StatusPill label="THRESHOLD: PROVISIONAL" variant="provisional" showDot />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-[#081A30]/80 px-2 py-1 border border-[#00CFFF]/25">
            <button
              type="button"
              data-testid="day-prev"
              onClick={() => setDashboardDay(dashboardDay - 1)}
              className="px-1.5 text-[#00CFFF] hover:text-white disabled:opacity-30"
              disabled={dashboardDay <= 1}
            >
              ‹
            </button>
            <span data-testid="day-label" className="text-[11px] font-mono text-[#00CFFF] uppercase">
              Day {dashboardDay}
            </span>
            <button
              type="button"
              data-testid="day-next"
              onClick={() => setDashboardDay(dashboardDay + 1)}
              className="px-1.5 text-[#00CFFF] hover:text-white disabled:opacity-30"
              disabled={dashboardDay >= 124}
            >
              ›
            </button>
          </div>
          <div className="text-[11px] font-mono text-cyan-400/80 bg-[#081A30]/80 px-3 py-1 rounded-full border border-[#00CFFF]/25">
            Aide à la décision, pas un diagnostic.
          </div>
        </div>
      </div>

      {/* Main Middle Row: Cylinder Stage (Left-Center) & Right Detail Panel */}
      <div className="relative flex-1 grid grid-cols-1 lg:grid-cols-[1fr_390px] xl:grid-cols-[1fr_430px] gap-6 items-center min-h-0 py-2">
        
        {/* ─── Center Stage: 3D CYLINDER CAROUSEL ───────────────────────────── */}
        <div
          className="relative w-full h-full flex flex-col items-center justify-center min-h-[380px]"
          onWheel={handleWheel}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Outer Holographic Rings (top and bottom rotating) */}
          <div
            className="absolute pointer-events-none w-[520px] h-[520px] rounded-full border border-[#00CFFF]/20 border-dashed animate-[spin_45s_linear_infinite]"
            style={{ transform: 'rotateX(75deg)' }}
          />
          <div
            className="absolute pointer-events-none w-[440px] h-[440px] rounded-full border border-[#00CFFF]/30 shadow-[0_0_30px_rgba(0,207,255,0.15)] animate-[spin_30s_linear_infinite_reverse]"
            style={{ transform: 'rotateX(75deg)' }}
          />

          {/* Ellipse Base Platform with Concentric Glow Rings */}
          <div
            className="absolute bottom-6 pointer-events-none w-[480px] h-[220px] flex items-center justify-center"
            style={{ transform: 'rotateX(75deg)' }}
          >
            <div className="absolute inset-0 rounded-full border-2 border-[#00CFFF]/45 shadow-[0_0_35px_rgba(0,207,255,0.6)]" />
            <div className="absolute inset-8 rounded-full border border-[#00CFFF]/30 shadow-[0_0_20px_rgba(0,207,255,0.3)]" />
            <div className="absolute inset-16 rounded-full border border-dashed border-[#00CFFF]/25" />
            <div className="w-16 h-16 rounded-full bg-[#00CFFF]/20 blur-md shadow-[0_0_40px_#00CFFF]" />
          </div>

          {/* Vertical Cyan Light Beam Behind Front Card */}
          <div
            className="absolute pointer-events-none w-24 h-[320px] -translate-y-4 bg-gradient-to-t from-[#00CFFF]/30 via-[#00CFFF]/10 to-transparent blur-xl"
            style={{ transform: 'scaleY(1)' }}
          />

          {/* 3D Perspective Stage */}
          <div
            className="relative w-[300px] h-[360px] flex items-center justify-center"
            style={{ perspective: 1200 }}
          >
            <motion.div
              className="relative w-full h-full flex items-center justify-center cursor-grab active:cursor-grabbing"
              style={{ transformStyle: 'preserve-3d' }}
              animate={{ rotateY: rotationAngle }}
              transition={SPRING_SNAP}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x > 40) handlePrev();
                else if (info.offset.x < -40) handleNext();
              }}
            >
              {CYLINDER_METRICS.map((metric, i) => {
                const cardAngle = i * 60;
                // Calculate angular distance to front
                const totalDiff = (cardAngle + rotationAngle) % 360;
                const normalizedDiff = Math.abs(((totalDiff + 540) % 360) - 180);
                const isFront = normalizedDiff < 30;
                const isFar = normalizedDiff > 120;

                return (
                  <div
                    key={metric.id}
                    onClick={() => rotateToIndex(i)}
                    style={{
                      position: 'absolute',
                      width: '210px',
                      height: '310px',
                      transform: `rotateY(${cardAngle}deg) translateZ(260px)`,
                      transformStyle: 'preserve-3d',
                      backfaceVisibility: 'hidden',
                      opacity: isFar ? 0.35 : isFront ? 1 : 0.6,
                      filter: isFront ? 'brightness(1.05)' : 'brightness(0.7)',
                      cursor: isFront ? 'default' : 'pointer',
                      transition: 'opacity 0.4s, filter 0.4s',
                    }}
                  >
                    <GlassCard
                      active={isFront}
                      padding="sm"
                      className={`w-full h-full flex flex-col justify-between p-4 transition-transform duration-300 ${
                        isFront ? 'scale-105 shadow-[0_0_35px_rgba(0,207,255,0.35)]' : ''
                      }`}
                    >
                      {/* Top row of card */}
                      <div className="flex items-center justify-between">
                        <div
                          className="p-2 rounded-xl border border-white/10"
                          style={{
                            backgroundColor: `${metric.color}20`,
                            color: metric.color,
                            boxShadow: isFront ? `0 0 16px ${metric.color}50` : undefined,
                          }}
                        >
                          <div className={isFront && metric.id === 'heart-rate' ? 'animate-pulse' : ''}>
                            {getMetricIcon(metric.iconName, 'w-5 h-5')}
                          </div>
                        </div>
                        <StatusPill
                          label={sleeping ? '…' : (metricStatusText(metric.id))}
                          variant={indicatorStatusVariant(metric.id)}
                          showDot={isFront}
                        />
                      </div>

                      {/* Middle: Big Value & Subtitle */}
                      <div className="my-2">
                        <div className="text-[11px] font-mono uppercase tracking-wider text-[#94b0d1]">
                          {metric.label}
                        </div>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span
                            data-testid={`metric-${metric.id}`}
                            className="font-heading text-4xl font-extrabold tracking-tight text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]"
                          >
                            {sleeping ? '···' : (resolveMetric(metric.id).text ?? 'NO DATA')}
                          </span>
                          <span className="text-xs font-mono text-[#00CFFF]">{metric.unit}</span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                          {metric.subtitle}
                        </div>
                      </div>

                      {/* Continuous ECG line on Heart Rate card or Sparkline */}
                      {metric.id === 'heart-rate' ? (
                        <div className="relative w-full h-12 overflow-hidden rounded-lg bg-black/40 border border-[#FF2D55]/20 flex items-center">
                          <svg
                            viewBox="0 0 200 40"
                            className="w-full h-full stroke-[#FF2D55] fill-none"
                            style={{ filter: 'drop-shadow(0 0 6px #FF2D55)' }}
                          >
                            <path
                              d="M 0 20 L 30 20 L 40 10 L 48 32 L 56 6 L 64 26 L 72 20 L 110 20 L 120 10 L 128 32 L 136 6 L 144 26 L 152 20 L 200 20"
                              strokeWidth="2"
                              strokeDasharray="200"
                              className="animate-ecg"
                            />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-full h-12 flex items-center justify-center">
                          <Sparkline
                            data={metric.history.map((h) => h.value)}
                            color={metric.color}
                            width={170}
                            height={34}
                          />
                        </div>
                      )}

                      {/* Bottom card info */}
                      <div className="pt-2 border-t border-white/10 flex justify-between items-center text-[10px] font-mono text-[#94b0d1]">
                        <span>REF: {metric.normalRange}</span>
                        <span
                          className={
                            resolveMetric(metric.id).text === null
                              ? 'text-gray-400'
                              : 'text-[#00CFFF]'
                          }
                        >
                          {sleeping ? '…' : metricStatusText(metric.id)}
                        </span>
                      </div>
                    </GlassCard>
                  </div>
                );
              })}
            </motion.div>
          </div>

          {/* Carousel Navigation Arrows & Exploration Prompt */}
          <div className="flex items-center gap-6 mt-4 z-20">
            <button
              type="button"
              onClick={handlePrev}
              title="Précédent"
              className="p-2.5 rounded-full bg-[#081A30]/80 border border-[#00CFFF]/40 text-[#00CFFF] hover:bg-[#00CFFF]/20 transition-all shadow-[0_0_12px_rgba(0,207,255,0.25)] active:scale-95"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex flex-col items-center">
              <span className="text-[11px] font-mono tracking-widest text-[#00CFFF] uppercase">
                FAITES DÉFILER POUR EXPLORER
              </span>
              <div className="flex gap-1.5 mt-1.5">
                {CYLINDER_METRICS.map((_, dotIdx) => (
                  <button
                    key={dotIdx}
                    onClick={() => rotateToIndex(dotIdx)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      dotIdx === currentIndex
                        ? 'w-6 bg-[#00CFFF] shadow-[0_0_8px_#00CFFF]'
                        : 'w-2 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleNext}
              title="Suivant"
              className="p-2.5 rounded-full bg-[#081A30]/80 border border-[#00CFFF]/40 text-[#00CFFF] hover:bg-[#00CFFF]/20 transition-all shadow-[0_0_12px_rgba(0,207,255,0.25)] active:scale-95"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ─── Right Panel: Selected Metric Detail ──────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeMetric.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="w-full h-full max-h-[480px] flex flex-col z-20"
          >
            <GlassCard padding="md" className="w-full h-full flex flex-col justify-between">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#00CFFF]/20">
                <div className="flex items-center gap-2.5">
                  <div
                    className="p-2 rounded-xl"
                    style={{ backgroundColor: `${activeMetric.color}25`, color: activeMetric.color }}
                  >
                    {getMetricIcon(activeMetric.iconName, 'w-5 h-5')}
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base text-white tracking-wide">
                      {activeMetric.label}
                    </h3>
                    <p className="text-[10px] font-mono text-[#94b0d1]">
                      Télémétrie IRCO · {dashboard?.subject_id ?? '…'}
                    </p>
                  </div>
                </div>
                <StatusPill
                  label={sleeping ? '…' : metricStatusText(activeMetric.id)}
                  variant={indicatorStatusVariant(activeMetric.id)}
                  showCheck={!sleeping && indicatorStatusVariant(activeMetric.id) === 'nominal'}
                />
              </div>

              {/* Value & 3D Heart Illustration Pulse */}
              <div className="flex items-center justify-between py-3">
                <div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-heading text-4xl font-extrabold text-white tracking-tight">
                      {sleeping ? '···' : (resolveMetric(activeMetric.id).text ?? 'NO DATA')}
                    </span>
                    <span className="text-sm font-mono text-[#00CFFF] font-semibold">
                      {activeMetric.unit}
                    </span>
                  </div>
                  {(() => {
                    const primary = (INDICATOR_IDS[activeMetric.id] ?? [])[0];
                    const ind = primary ? indicatorMap.get(primary) : undefined;
                    if (sleeping || !ind) {
                      return (
                        <div className="flex items-center gap-1.5 mt-1 text-xs font-mono text-gray-400">
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>Qualité: …</span>
                        </div>
                      );
                    }
                    const tq = ind.measurement_quality || ind.quality;
                    const colorCls =
                      tq === 'valid' ? 'text-[#22C55E]' : tq === 'suspect' ? 'text-[#FF2D55]' : 'text-gray-400';
                    return (
                      <div className={`flex items-center gap-1.5 mt-1 text-xs font-mono ${colorCls}`}>
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>
                          Qualité: {tq || 'unknown'}
                          {ind.last_updated ? ` · ${ind.last_updated.slice(11, 16)} UTC` : ''}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {/* Pulsing Holographic Heart Icon / Asset */}
                <div className="relative flex items-center justify-center w-16 h-16">
                  <div
                    className="absolute inset-0 rounded-full animate-ping opacity-25"
                    style={{ backgroundColor: activeMetric.color }}
                  />
                  <div
                    className="p-3.5 rounded-full border border-white/20 shadow-lg"
                    style={{
                      backgroundColor: `${activeMetric.color}20`,
                      boxShadow: `0 0 25px ${activeMetric.color}50`,
                    }}
                  >
                    <Heart
                      className="w-7 h-7 text-[#FF2D55] animate-pulse"
                      fill={activeMetric.id === 'heart-rate' ? '#FF2D55' : 'none'}
                    />
                  </div>
                </div>
              </div>

              {/* Real-time Area Chart (Recharts) */}
              <div className="h-28 w-full py-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricHistory(activeMetric.id)}>
                    <defs>
                      <linearGradient id="areaGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00CFFF" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#00CFFF" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" hide />
                    <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip
                      content={({ payload }) => {
                        if (payload && payload.length) {
                          return (
                            <div className="bg-[#081A30] border border-[#00CFFF]/40 px-2 py-1 rounded text-[11px] font-mono text-white shadow-xl">
                              {payload[0].value} {activeMetric.unit}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#00CFFF"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#areaGlow)"
                      isAnimationActive={!reducedMotion}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* 3 Metric Info Boxes */}
              <div className="grid grid-cols-3 gap-2 py-2">
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="text-[9px] font-mono uppercase text-[#94b0d1]">Plage Normale</div>
                  <div className="text-xs font-mono font-bold text-white mt-0.5">
                    {activeMetric.normalRange}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="text-[9px] font-mono uppercase text-[#94b0d1]">Baseline (API)</div>
                  <div className="text-xs font-mono font-bold text-white mt-0.5">
                    {sleeping ? '…' : (metricBaseline(activeMetric.id) ?? 'NO DATA')}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-white/5 border border-white/10 text-center">
                  <div className="text-[9px] font-mono uppercase text-[#94b0d1]">Variabilité</div>
                  <div className="text-xs font-mono font-bold text-white mt-0.5">
                    {sleeping ? '…' : (metricBaselineSd(activeMetric.id) ?? 'NO DATA')}
                  </div>
                </div>
              </div>

              {/* Collapsible Details & History Button */}
              <div className="pt-2 border-t border-[#00CFFF]/20 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDetailsExpanded(!detailsExpanded)}
                  className="text-[11px] font-mono text-[#94b0d1] hover:text-[#00CFFF] flex items-center gap-1 transition-colors"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>{detailsExpanded ? 'Masquer détails' : 'Détails capteurs'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-semibold text-[#00CFFF] bg-[#00CFFF]/15 border border-[#00CFFF]/40 hover:bg-[#00CFFF]/25 transition-all shadow-[0_0_10px_rgba(0,207,255,0.2)] cursor-pointer"
                >
                  Voir l'historique
                </button>
              </div>

              {/* Expanded details animated panel */}
              {detailsExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-2 p-2.5 rounded-xl bg-[#020B18]/90 border border-[#00CFFF]/30 text-[10px] font-mono text-gray-300 space-y-1"
                >
                  <div className="flex justify-between">
                    <span>Source télémétrie:</span>
                    <span className="text-[#00CFFF]">BIOSENSOR_WEARABLE_A7</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Qualité de mesure:</span>
                    <span className="text-[#22C55E]">VALID · 100% CONFIDENCE</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fréquence d'échantillonnage:</span>
                    <span className="text-white">1 Hz continu</span>
                  </div>
                </motion.div>
              )}
            </GlassCard>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ─── Bottom KPI Dock (4 Cards) + Globe + Floating Astronaut ────────── */}
      <div className="relative z-20 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-center pt-2">
        
        {/* KPI 1: Global vigilance level from GET /dashboard → global.level */}
        <GlassCard padding="sm" className="flex items-center gap-4">
          <div
            data-testid="global-level-badge"
            className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-mono font-bold"
            style={{
              borderColor:
                level === 'green' ? '#22C55E' : level === 'amber' ? '#F59E0B' : level === 'red' ? '#FF2D55' : '#6b7280',
              color:
                level === 'green' ? '#22C55E' : level === 'amber' ? '#F59E0B' : level === 'red' ? '#FF2D55' : '#6b7280',
              boxShadow: `0 0 14px ${
                level === 'green' ? '#22C55E55' : level === 'amber' ? '#F59E0B55' : level === 'red' ? '#FF2D5555' : 'transparent'
              }`,
            }}
          >
            {sleeping ? '···' : level.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase text-[#94b0d1]">Vigilance Globale</div>
            <div className="font-heading text-lg font-bold text-white flex items-center gap-1.5">
              <span>{sleeping ? '···' : levelText}</span>
              <span className="text-[10px] font-mono font-semibold text-[#A78BFA] bg-[#A78BFA]/15 px-1.5 rounded">
                {dashboard?.global?.confidence ?? '…'}
              </span>
            </div>
            <div className="w-full mt-1 text-[10px] font-mono text-[#94b0d1]">
              {(dashboard?.global?.badges ?? []).join(' · ') || 'no badges'}
            </div>
          </div>
        </GlassCard>

        {/* KPI 2: SpO₂ — real value or NO DATA */}
        <GlassCard padding="sm" className="flex items-center gap-4">
          <RingGauge
            value={spo2Metric.text ? Number(spo2Metric.text) : 0}
            max={100}
            size={58}
            strokeWidth={5}
            color={spo2Metric.text ? '#00CFFF' : '#6b7280'}
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase text-[#94b0d1]">Saturation O₂ (SpO₂)</div>
            <div className="font-heading text-lg font-bold text-white flex items-center gap-1.5">
              <span data-testid="kpi-spo2">{sleeping ? '···' : (spo2Metric.text ?? 'NO DATA')}</span>
              <span className="text-[10px] font-mono font-semibold text-gray-400 bg-white/5 px-1.5 rounded">
                {spo2Metric.text ? 'MEASURED' : 'NO DATA'}
              </span>
            </div>
            <div className="w-full mt-1">
              <Sparkline data={metricHistory('spo2').map((h) => h.value)} color={spo2Metric.text ? '#00CFFF' : '#6b7280'} width={110} height={18} />
            </div>
          </div>
        </GlassCard>

        {/* KPI 3: Body temperature — real value or NO DATA */}
        <GlassCard padding="sm" className="flex items-center gap-4">
          <RingGauge
            value={tempMetric.text ? Number(tempMetric.text) : 0}
            max={40}
            size={58}
            strokeWidth={5}
            color={tempMetric.text ? '#F59E0B' : '#6b7280'}
            unit="°C"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-mono uppercase text-[#94b0d1]">Température Corporelle</div>
            <div className="font-heading text-lg font-bold text-white flex items-center gap-1.5">
              <span data-testid="kpi-temp">{sleeping ? '···' : (tempMetric.text ?? 'NO DATA')}</span>
              <span className="text-[10px] font-mono font-semibold text-gray-400 bg-white/5 px-1.5 rounded">
                {tempMetric.text ? '°C' : 'NO DATA'}
              </span>
            </div>
            <div className="w-full mt-1">
              <Sparkline data={metricHistory('body-temp').map((h) => h.value)} color={tempMetric.text ? '#F59E0B' : '#6b7280'} width={110} height={18} />
            </div>
          </div>
        </GlassCard>

        {/* KPI 4: Mission status from the API (mission_id / environment / alerts) */}
        <GlassCard padding="sm" className="relative flex items-center justify-between overflow-hidden">
          <div className="z-10">
            <div className="text-[10px] font-mono uppercase text-[#94b0d1]">Statut Mission</div>
            <div className="flex items-center gap-1.5 text-sm font-heading font-bold text-[#22C55E] mt-0.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {sleeping
                  ? '···'
                  : level === 'green'
                  ? 'Systèmes Nominaux'
                  : level === 'amber'
                  ? 'Vigilance Requise'
                  : level === 'red'
                  ? 'État Critique'
                  : 'Sans Données'}
              </span>
            </div>
            <div className="text-[10px] font-mono text-[#00CFFF] mt-1" data-testid="mission-id">
              {sleeping
                ? '···'
                : `${dashboard?.mission?.mission_id ?? '—'} · ${dashboard?.mission?.environment ?? '—'}`}
            </div>
          </div>

          {/* Floating Astronaut Asset */}
          <motion.div
            animate={{
              y: [0, -8, 0],
              rotate: [0, 1.5, -1.5, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="w-14 h-14 -mr-2 object-contain filter drop-shadow-[0_0_12px_rgba(0,207,255,0.4)]"
          >
            <img src={astronautImg} alt="Astronaut" className="w-full h-full object-contain" />
          </motion.div>
        </GlassCard>
      </div>

      {/* Floating Bottom-Left MiniGlobe */}
      <div className="absolute bottom-5 left-6 z-30 hidden xl:block">
        <MiniGlobe size={60} />
      </div>

      {/* ─── History Modal ────────────────────────────────────────────────── */}
      {isHistoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-xl rounded-3xl bg-[#081A30] border border-[#00CFFF]/50 p-6 shadow-2xl relative"
          >
            <button
              onClick={() => setIsHistoryModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <Calendar className="w-6 h-6 text-[#00CFFF]" />
              <h2 className="text-xl font-heading font-bold text-white">
                Historique Télémétrique — {activeMetric.label}
              </h2>
            </div>

            <div className="h-64 w-full my-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activeMetric.history}>
                  <XAxis dataKey="time" stroke="#6d88ab" />
                  <YAxis stroke="#6d88ab" />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#00CFFF" fill="#00CFFF" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="flex justify-between items-center text-xs font-mono text-gray-400 border-t border-white/10 pt-4">
              <span>
                {dashboard?.last_updated
                  ? `Dernière mise à jour API: ${dashboard.last_updated.slice(11, 16)} UTC`
                  : 'Synchronisation IRCO en cours'}
              </span>
              <button
                onClick={() => setIsHistoryModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#00CFFF] text-[#020B18] font-bold hover:bg-[#00CFFF]/90"
              >
                Fermer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default CockpitView;
