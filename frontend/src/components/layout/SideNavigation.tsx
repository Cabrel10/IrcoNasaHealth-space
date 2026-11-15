import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Activity,
  Heart,
  Brain,
  Wind,
  Moon,
  AlertTriangle,
  FileText,
  ChevronsRight,
  BarChart3,
  Database,
  Settings,
  LogOut,
  Atom,
} from 'lucide-react';
import { useMissionStore } from '@/stores/useMissionStore';
import { COCKPIT_NAV_ITEMS } from '@/constants/navigation';
import { MiniGlobe } from '@/components/ui/MiniGlobe';

export const SideNavigation: React.FC = () => {
  const { activeNavId, setActiveNav } = useMissionStore();
  const isCrewVariant = activeNavId === 'crew-health';

  const getCockpitIcon = (id: string) => {
    switch (id) {
      case 'mission-overview':
        return LayoutDashboard;
      case 'crew-health':
        return Activity;
      case 'cardiovascular':
        return Heart;
      case 'neurological':
        return Brain;
      case 'respiratory':
        return Wind;
      case 'sleep-fatigue':
        return Moon;
      case 'medical-alerts':
        return AlertTriangle;
      case 'history-reports':
        return FileText;
      default:
        return LayoutDashboard;
    }
  };

  const centerIndex = (COCKPIT_NAV_ITEMS.length - 1) / 2;

  return (
    <motion.aside
      layout
      transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
      className={`fixed left-0 top-[72px] bottom-0 z-40 select-none flex flex-col justify-between border-r border-[#00CFFF]/20 bg-[#020B18]/75 backdrop-blur-2xl px-3 py-5 overflow-hidden ${
        isCrewVariant ? 'w-[80px]' : 'w-[290px]'
      }`}
    >
      {/* Glow background accent */}
      <div className="absolute top-1/4 -left-16 w-32 h-64 bg-[#00CFFF]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Section */}
      <div className="flex flex-col">
        {/* Section title (Cockpit) or Logo (Crew) */}
        <div className="h-8 mb-4 flex items-center px-2">
          <AnimatePresence mode="wait">
            {!isCrewVariant ? (
              <motion.div
                key="telemetry-label"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="text-[11px] font-mono tracking-[0.2em] text-[#00CFFF]/80 uppercase font-semibold flex items-center gap-2"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#00CFFF] shadow-[0_0_6px_#00CFFF]" />
                TELEMETRY SYSTEMS
              </motion.div>
            ) : (
              <motion.div
                key="rail-logo"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.2 }}
                className="w-full flex justify-center"
              >
                <div className="p-2 rounded-xl bg-[#00CFFF]/15 border border-[#00CFFF]/40 text-[#00CFFF] shadow-[0_0_12px_rgba(0,207,255,0.4)]">
                  <Atom className="w-5 h-5 animate-[spin_20s_linear_infinite]" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation list */}
        {!isCrewVariant ? (
          /* Cockpit Curved Menu */
          <div style={{ perspective: 1000 }} className="relative flex flex-col gap-1.5">
            {COCKPIT_NAV_ITEMS.map((item, idx) => {
              const Icon = getCockpitIcon(item.id);
              const isActive = activeNavId === item.id;
              const offsetFromCenter = idx - centerIndex;
              // Curved illusion: rotateY and translateX
              const rotateY = offsetFromCenter * 3.5;
              const translateX = Math.abs(offsetFromCenter) * 4;

              return (
                <motion.div
                  key={item.id}
                  initial={{ x: -120, rotateY: -40, opacity: 0 }}
                  animate={{ x: 0, rotateY, opacity: 1 }}
                  transition={{
                    delay: idx * 0.06,
                    duration: 0.5,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  style={{
                    transformOrigin: 'left center',
                    transform: `translateX(${translateX}px) rotateY(${rotateY}deg)`,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setActiveNav(item.id)}
                    className={`relative w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-sm font-medium transition-all duration-200 group ${
                      isActive
                        ? 'border-l-4 border-l-[#00CFFF] border border-[#00CFFF]/50 bg-gradient-to-r from-[#00CFFF]/25 via-[#081A30]/80 to-transparent text-white shadow-[inset_12px_0_20px_-6px_rgba(0,207,255,0.4),0_0_16px_rgba(0,207,255,0.15)]'
                        : 'border border-[#00CFFF]/10 bg-[#081A30]/30 text-[#94b0d1] hover:border-[#00CFFF]/30 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-active-indicator"
                        className="absolute inset-0 rounded-xl bg-transparent pointer-events-none"
                      />
                    )}

                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                          isActive
                            ? 'text-[#00CFFF] drop-shadow-[0_0_8px_#00CFFF]'
                            : 'text-[#6d88ab] group-hover:text-white'
                        }`}
                      />
                      <span className="truncate tracking-wide text-[13px]">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.alertCount && (
                        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FF2D55] px-1 text-[10px] font-mono font-bold text-white shadow-[0_0_8px_#FF2D55]">
                          {item.alertCount}
                        </span>
                      )}
                      {isActive && (
                        <ChevronsRight className="w-4 h-4 text-[#00CFFF] animate-pulse drop-shadow-[0_0_6px_#00CFFF]" />
                      )}
                    </div>
                  </button>
                </motion.div>
              );
            })}
          </div>
        ) : (
          /* Crew Health Compact Rail */
          <div className="flex flex-col items-center gap-3">
            {[
              { id: 'crew-health', label: 'Vitals', icon: Activity },
              { id: 'stats', label: 'Stats', icon: BarChart3 },
              { id: 'database', label: 'Database', icon: Database },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((btn) => {
              const Icon = btn.icon;
              const isActive = activeNavId === btn.id;

              return (
                <button
                  key={btn.id}
                  type="button"
                  title={btn.label}
                  onClick={() => setActiveNav(btn.id)}
                  className={`relative p-3 rounded-2xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-[#00CFFF]/25 border border-[#00CFFF] text-[#00CFFF] shadow-[0_0_18px_rgba(0,207,255,0.45)]'
                      : 'bg-[#081A30]/60 border border-[#00CFFF]/15 text-[#94b0d1] hover:bg-white/5 hover:text-white hover:border-[#00CFFF]/30'
                  }`}
                >
                  <Icon className="w-5 h-5 transition-transform group-hover:scale-110" />
                  {isActive && (
                    <motion.div
                      layoutId="rail-active"
                      className="absolute -right-1 top-1/2 -translate-y-1/2 w-1 h-4 rounded-full bg-[#00CFFF] shadow-[0_0_8px_#00CFFF]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Section */}
      <div className="flex flex-col items-center">
        {!isCrewVariant ? (
          <div className="w-full flex items-center justify-between pt-4 border-t border-[#00CFFF]/15">
            <button
              type="button"
              onClick={() => setActiveNav('crew-health')}
              className="text-xs font-mono text-[#00CFFF] hover:underline flex items-center gap-1.5 opacity-80 hover:opacity-100"
            >
              <span>VUE ÉQUIPAGE</span>
              <ChevronsRight className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-1 text-[11px] font-mono text-[#22C55E]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
              <span>SYNC 100%</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 pt-4 border-t border-[#00CFFF]/15 w-full">
            <button
              type="button"
              title="Retour Cockpit"
              onClick={() => setActiveNav('mission-overview')}
              className="p-2.5 rounded-xl bg-white/5 border border-[#00CFFF]/20 text-[#00CFFF] hover:bg-[#00CFFF]/20 transition-colors"
            >
              <LayoutDashboard className="w-4 h-4" />
            </button>

            <button
              type="button"
              title="Déconnexion"
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-red-400 hover:border-red-400/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>

            {/* Mini Globe at bottom of rail */}
            <div className="scale-75 origin-center">
              <MiniGlobe size={52} />
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
};

export default SideNavigation;
