import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock, Satellite, Wifi, ChevronDown, Bell, ShieldAlert } from 'lucide-react';
import { useMissionStore } from '@/stores/useMissionStore';
import { useChrono } from '@/hooks/useChrono';

export const TopBar: React.FC = () => {
  const {
    missionName,
    activeNavId,
    dashboard,
  } = useMissionStore();

  const { tPlus, met } = useChrono();
  const [alertOpen, setAlertOpen] = useState(false);

  const isCrewView = activeNavId === 'crew-health';
  const subjectId = dashboard?.subject_id ?? '…';
  const alerts = dashboard?.active_alerts ?? [];
  const level = dashboard?.global?.level ?? 'no_data';

  return (
    <header className="relative z-50 h-[72px] w-full select-none px-6 flex items-center justify-between border-b border-[#00CFFF]/20 bg-[#020B18]/70 backdrop-blur-2xl">
      {/* Glow line under header */}
      <div className="pointer-events-none absolute inset-x-8 bottom-0 h-px bg-gradient-to-r from-transparent via-[#00CFFF]/45 to-transparent shadow-[0_0_8px_#00CFFF]" />

      {/* Left: SpaceMed Brand */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center">
          <span className="absolute inset-0 rounded-full border border-[#00CFFF]/50 shadow-[0_0_16px_rgba(0,207,255,0.65)]" />
          <svg
            className="h-6 w-6 text-[#00CFFF] drop-shadow-[0_0_8px_rgba(0,207,255,0.9)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="3.2" fill="currentColor" fillOpacity="0.25" />
            <ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(-28 12 12)" />
            <ellipse cx="12" cy="12" rx="9.2" ry="3.6" transform="rotate(32 12 12)" opacity="0.55" />
          </svg>
        </div>
        <div className="leading-tight">
          <div className="flex items-center gap-2">
            <span className="font-heading text-[18px] font-bold tracking-[0.16em] text-white uppercase drop-shadow-[0_0_10px_rgba(255,255,255,0.3)]">
              SpaceMed
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-[#00CFFF]/20 text-[#00CFFF] border border-[#00CFFF]/40">
              V1.0
            </span>
          </div>
          <div className="text-[11px] font-medium tracking-[0.14em] text-[#8ea4bf]">
            Mission Health Monitor
          </div>
        </div>
      </div>

      {/* Center: Dynamic variants cross-fading */}
      <div className="relative flex-1 flex items-center justify-center min-w-0 px-4">
        <AnimatePresence mode="wait">
          {!isCrewView ? (
            /* VARIANT A: Cockpit Overview */
            <motion.div
              key="cockpit-bar"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3 overflow-hidden"
            >
              {/* Mission Pill */}
              <div className="flex items-center gap-2.5 rounded-full px-4 py-1.5 bg-[#081A30]/75 border border-[#00CFFF]/30 shadow-[inset_0_0_12px_rgba(0,207,255,0.15)]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22C55E] opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22C55E] shadow-[0_0_8px_#22C55E]" />
                </span>
                <span className="text-[13px] font-medium text-white">{missionName}</span>
                <span className="h-3.5 w-px bg-[#00CFFF]/30" />
                <span className="text-[12px] font-semibold text-[#22C55E] uppercase font-mono tracking-wider">
                  Active
                </span>
              </div>

              {/* Subject Pill (single-subject demo from the API) */}
              <div className="flex items-center gap-2 rounded-full px-4 py-1.5 bg-[#081A30]/75 border border-[#00CFFF]/30 shadow-[inset_0_0_12px_rgba(0,207,255,0.15)]">
                <Users className="h-3.5 w-3.5 text-[#00CFFF]" />
                <span className="text-[13px] font-medium text-white">Sujet {subjectId}</span>
              </div>

              {/* T+ Live Chrono Pill */}
              <div className="flex items-center gap-2 rounded-full px-4 py-1.5 bg-[#081A30]/75 border border-[#00CFFF]/30 shadow-[inset_0_0_12px_rgba(0,207,255,0.15)]">
                <Clock className="h-3.5 w-3.5 text-[#00CFFF] drop-shadow-[0_0_6px_#00CFFF]" />
                <span className="font-mono text-[13px] font-semibold tracking-[0.14em] text-[#00CFFF] drop-shadow-[0_0_6px_rgba(0,207,255,0.8)]">
                  {tPlus}
                </span>
              </div>
            </motion.div>
          ) : (
            /* VARIANT B: Crew Health */
            <motion.div
              key="crew-bar"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3 overflow-hidden"
            >
              {/* MET Pill */}
              <div className="flex items-center gap-2 rounded-full px-4 py-1.5 bg-[#081A30]/75 border border-[#00CFFF]/30 shadow-[inset_0_0_12px_rgba(0,207,255,0.15)]">
                <Clock className="h-3.5 w-3.5 text-[#00CFFF]" />
                <span className="font-mono text-[13px] font-semibold tracking-wider text-white">
                  MET <span className="text-[#00CFFF]">{met}</span>
                </span>
              </div>

              {/* Earth delay from the API mission payload */}
              <div className="flex items-center gap-2 rounded-full px-4 py-1.5 bg-[#081A30]/75 border border-[#00CFFF]/30 shadow-[inset_0_0_12px_rgba(0,207,255,0.15)]">
                <span className="h-2 w-2 rounded-full bg-[#22C55E] shadow-[0_0_8px_#22C55E]" />
                <span className="text-[12px] font-mono text-[#c5d7ea]">
                  Earth Delay: {dashboard?.mission?.earth_delay_min ?? '—'} min
                </span>
              </div>

              {/* Mission day from the API */}
              <div className="flex items-center gap-2 rounded-full px-4 py-1.5 bg-[#081A30]/75 border border-[#00CFFF]/30 shadow-[inset_0_0_12px_rgba(0,207,255,0.15)]">
                <span className="text-[12px] font-mono text-[#94b0d1]">
                  Day <strong className="text-white">{dashboard?.mission?.mission_day ?? '—'}</strong>
                </span>
              </div>

              {/* Alert Dropdown Trigger (real active alerts) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAlertOpen(!alertOpen)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 border transition-colors ${
                    alerts.length > 0
                      ? 'bg-[#FF2D55]/20 border-[#FF2D55]/50 text-[#FF2D55] shadow-[0_0_12px_rgba(255,45,85,0.35)] hover:bg-[#FF2D55]/30'
                      : 'bg-white/5 border-white/15 text-gray-400'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span className="text-[12px] font-mono font-bold tracking-wider">
                    {alerts.length > 0 ? `${alerts.length} ALERT${alerts.length > 1 ? 'S' : ''}` : 'NO ALERT'}
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${alertOpen ? 'rotate-180' : ''}`} />
                </button>

                {alertOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    className="absolute top-full mt-2 right-0 w-72 rounded-2xl bg-[#081A30]/95 border border-[#FF2D55]/50 p-3 shadow-2xl backdrop-blur-2xl z-50 text-left"
                  >
                    {alerts.length === 0 ? (
                      <p className="text-[11px] text-gray-400 font-mono">
                        Aucune alerte active pour ce jour de démo ({subjectId}).
                      </p>
                    ) : (
                      alerts.map((a) => (
                        <div key={a.id} className="mb-2 last:mb-0">
                          <div className="flex items-center gap-2 text-[#FF2D55] font-semibold text-xs mb-1">
                            <ShieldAlert className="w-4 h-4" />
                            <span>{a.id}</span>
                          </div>
                          <p className="text-[11px] text-gray-300 font-mono">
                            Vigilance: {a.vigilance} · Règles: {(a.triggered_rules ?? []).join(', ')}
                          </p>
                        </div>
                      ))
                    )}
                    <div className="mt-2 text-[10px] text-gray-400 font-mono flex justify-between border-t border-white/10 pt-1">
                      <span>Source: GET /api/v1/dashboard</span>
                      <span className="text-[#F59E0B]">SYNTHETIC</span>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: Signal & User Astronaut Avatar */}
      <div className="flex shrink-0 items-center gap-4">
        {/* Signal telemetry */}
        <div className="flex items-center gap-2 rounded-full px-3 py-1 bg-[#081A30]/60 border border-[#00CFFF]/25 text-[#00CFFF]">
          <Satellite className="h-3.5 w-3.5 animate-pulse" />
          <Wifi className="h-3.5 w-3.5" />
          <span className="text-[11px] font-mono tracking-wider text-white">LINK OK</span>
        </div>

        {/* Subject identity from the API (no invented crew member) */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#081A30] border-2 border-[#00CFFF] shadow-[0_0_14px_rgba(0,207,255,0.85)]">
            <span className="font-heading font-bold text-xs text-[#00CFFF]">A1</span>
          </div>
          <div className="hidden lg:block text-left leading-tight">
            <div className="font-heading text-xs font-semibold text-white tracking-wide">
              Sujet {subjectId}
            </div>
            <div className="text-[10px] font-mono tracking-wider text-[#00CFFF]">
              {level.toUpperCase()} · {dashboard?.data_class?.toUpperCase() ?? '…'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
