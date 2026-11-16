import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronsRight, Atom, Menu, X } from 'lucide-react';
import {
  CardiovascularIcon,
  CrewHeartPulseIcon,
  HistoryReportsIcon,
  MedicalAlertsIcon,
  MissionRocketIcon,
  NeurologicalBrainIcon,
  RespiratoryLungsIcon,
  SleepBedIcon,
} from './HudIcons';
import { buildHullGeometry, HULL_GEOMETRY_CONFIG } from './hullGeometry';
import { useMissionStore } from '@/stores/useMissionStore';
import { COCKPIT_NAV_ITEMS } from '@/constants/navigation';
import { useReducedMotion } from '@/hooks/useChrono';

interface HudNavItem {
  id: string;
  label: string;
  badge?: number;
  renderIcon: (isActive: boolean) => React.ReactNode;
}

const createHudNavItems = (navItems: typeof COCKPIT_NAV_ITEMS): HudNavItem[] => {
  return navItems.map((item) => {
    let renderIcon: (isActive: boolean) => React.ReactNode;

    switch (item.id) {
      case 'mission-overview':
        renderIcon = (isActive) => (
          <MissionRocketIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#F1F7FF]' : 'text-[#B9DDF7]'}
          />
        );
        break;
      case 'crew-health':
        renderIcon = (isActive) => (
          <CrewHeartPulseIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#19EFFF]' : 'text-[#20E9E8]'}
          />
        );
        break;
      case 'anatomy':
        renderIcon = (isActive) => (
          <Atom
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#19EFFF]' : 'text-[#B9DDF7]'}
          />
        );
        break;
      case 'cardiovascular':
        renderIcon = (isActive) => (
          <CardiovascularIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#19EFFF]' : 'text-[#B9DDF7]'}
          />
        );
        break;
      case 'neurological':
        renderIcon = (isActive) => (
          <NeurologicalBrainIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#19EFFF]' : 'text-[#B9DDF7]'}
          />
        );
        break;
      case 'respiratory':
        renderIcon = (isActive) => (
          <RespiratoryLungsIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#19EFFF]' : 'text-[#B9DDF7]'}
          />
        );
        break;
      case 'sleep-fatigue':
        renderIcon = (isActive) => (
          <SleepBedIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#19EFFF]' : 'text-[#B9DDF7]'}
          />
        );
        break;
      case 'medical-alerts':
        renderIcon = () => (
          <MedicalAlertsIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
          />
        );
        break;
      case 'history-reports':
        renderIcon = (isActive) => (
          <HistoryReportsIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#19EFFF]' : 'text-[#B9DDF7]'}
          />
        );
        break;
      default:
        renderIcon = (isActive) => (
          <MissionRocketIcon
            size={HULL_GEOMETRY_CONFIG.iconVisualSizePx}
            strokeWidth={HULL_GEOMETRY_CONFIG.iconStrokeWidth}
            className={isActive ? 'text-[#F1F7FF]' : 'text-[#B9DDF7]'}
          />
        );
    }

    return {
      id: item.id,
      label: item.label,
      badge: item.alertCount,
      renderIcon,
    };
  });
};

export function CurvedSidebar() {
  const { activeNavId, setActiveNav, dashboard } = useMissionStore();
  const reducedMotion = useReducedMotion();
  const [mobileOpen, setMobileOpen] = useState(false);
  const alertCount = dashboard?.active_alerts?.length ?? 0;

  const HUD_NAV_ITEMS = useMemo(
    () =>
      createHudNavItems(COCKPIT_NAV_ITEMS).map((item) => ({
        ...item,
        badge: item.id === 'medical-alerts' && alertCount > 0 ? alertCount : undefined,
      })),
    [alertCount],
  );
  const geometry = useMemo(() => buildHullGeometry(HUD_NAV_ITEMS.length), [HUD_NAV_ITEMS.length]);

  const topPadPct =
    ((HULL_GEOMETRY_CONFIG.topY + HULL_GEOMETRY_CONFIG.contentTopInset) /
      HULL_GEOMETRY_CONFIG.viewBoxHeight) *
    100;
  const bottomPadPct =
    ((HULL_GEOMETRY_CONFIG.viewBoxHeight -
      HULL_GEOMETRY_CONFIG.bottomY +
      HULL_GEOMETRY_CONFIG.contentBottomInset) /
      HULL_GEOMETRY_CONFIG.viewBoxHeight) *
    100;

  return (
    <>
      <button
        type="button"
        aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((open) => !open)}
        className="fixed left-3 top-[82px] z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-[#00CFFF]/40 bg-[#081A30]/95 text-[#00CFFF] shadow-lg md:hidden"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-x-0 bottom-0 top-[72px] z-30 bg-black/55 md:hidden"
        />
      )}
      <aside
      aria-label="Holographic Medical Cockpit Navigation"
      data-reduced-motion={reducedMotion}
      className={`fixed left-0 top-[72px] bottom-0 z-40 items-center px-3 ${
        mobileOpen ? 'flex' : 'hidden'
      } md:flex`}
      style={{ perspective: 'var(--hud-perspective, 960px)' }}
    >
      {/* Définition SVG masquée pour le clip-path exact de la silhouette cylindrique */}
      <svg className="pointer-events-none absolute h-0 w-0" aria-hidden="true">
        <defs>
          <clipPath id="cockpit-hull-clip" clipPathUnits="objectBoundingBox">
            <path d={geometry.clipPathNormalized} />
          </clipPath>
        </defs>
      </svg>

      <motion.div
        initial={reducedMotion ? false : { opacity: 0, x: -56, rotateY: 24, rotateX: 4 }}
        animate={reducedMotion
          ? { opacity: 1, x: 0, rotateY: 0, rotateX: 0 }
          : { opacity: 1, x: 0, rotateY: 11, rotateX: 2.5 }}
        transition={{ duration: reducedMotion ? 0 : 0.72, ease: [0.16, 1, 0.3, 1] }}
        style={{
          transformStyle: 'preserve-3d',
          aspectRatio: `${HULL_GEOMETRY_CONFIG.viewBoxWidth} / ${HULL_GEOMETRY_CONFIG.viewBoxHeight}`,
        }}
        className="relative w-[252px] xl:w-[292px] max-w-[88vw]"
      >
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
          className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-md border border-[#00CFFF]/30 bg-[#081A30]/90 text-[#00CFFF] md:hidden"
        >
          <X size={16} />
        </button>
        {/* 1. Surface vitrée translucide découpée selon le contour SVG */}
        <div
          aria-hidden="true"
          style={{
            clipPath: 'url(#cockpit-hull-clip)',
            background:
              'linear-gradient(175deg, rgba(6, 27, 60, 0.90) 0%, rgba(8, 38, 83, 0.84) 50%, rgba(6, 27, 60, 0.90) 100%)',
          }}
          className="pointer-events-none absolute inset-0 backdrop-blur-[12px]"
        >
          {/* Reflet cyan directionnel côté gauche et ombre de profondeur côté droit */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_14%_50%,rgba(0,240,255,0.16),transparent_58%)]" />
          <div className="absolute inset-0 shadow-[inset_12px_0_26px_rgba(0,240,255,0.14),inset_-10px_0_22px_rgba(2,9,31,0.55)]" />
        </div>

        {/* 2. Tracé SVG indépendant des bordures et des séparateurs incurvés */}
        <svg
          data-testid="curved-sidebar-hull"
          viewBox={`0 0 ${HULL_GEOMETRY_CONFIG.viewBoxWidth} ${HULL_GEOMETRY_CONFIG.viewBoxHeight}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        >
          <defs>
            <filter id="hud-left-glow" x="-40%" y="-10%" width="180%" height="120%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="4.5"
                floodColor="#00F0FF"
                floodOpacity="0.88"
              />
            </filter>
            <filter id="hud-right-glow" x="-30%" y="-10%" width="160%" height="120%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="2.6"
                floodColor="#00DFFF"
                floodOpacity="0.45"
              />
            </filter>
          </defs>

          {/* Périmètre général discret pour la continuité des courbes */}
          <path
            d={geometry.hullPath}
            fill="none"
            stroke="rgba(0, 223, 255, 0.28)"
            strokeWidth="1.2"
          />

          {/* Séparateurs horizontaux incurvés ancrés aux deux parois */}
          {geometry.dividers.map((div) => (
            <path
              key={div.key}
              d={div.d}
              fill="none"
              stroke="rgba(0, 223, 255, 0.25)"
              strokeWidth="0.85"
            />
          ))}

          {/* Bordure gauche cyan intense (source lumineuse principale) */}
          <path
            d={geometry.leftEdgePath}
            fill="none"
            stroke="#00F0FF"
            strokeWidth="2.8"
            strokeLinecap="round"
            filter="url(#hud-left-glow)"
          />

          {/* Bordure droite fortement incurvée avec éclairage cyan plus discret */}
          <path
            d={geometry.rightEdgePath}
            fill="none"
            stroke="rgba(0, 223, 255, 0.62)"
            strokeWidth="1.9"
            strokeLinecap="round"
            filter="url(#hud-right-glow)"
          />
        </svg>

        {/* 3. Couche de navigation : contenus non déformés alignés dans les marges de sécurité */}
        <nav
          aria-label="Medical Telemetry Modules"
          className="relative z-10 flex h-full flex-col"
          style={{
            paddingTop: `${topPadPct.toFixed(2)}%`,
            paddingBottom: `${bottomPadPct.toFixed(2)}%`,
            transformStyle: 'preserve-3d',
          }}
        >
          <ul
            className="flex h-full flex-col justify-between"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {HUD_NAV_ITEMS.map((item, index) => {
              const isActive = activeNavId === item.id;
              const inset = geometry.rowInsets[index];

              return (
                <li
                  key={item.id}
                  className="flex flex-1 items-center py-[3px]"
                  style={{
                    paddingLeft: inset.paddingLeftPct,
                    paddingRight: inset.paddingRightPct,
                    transformStyle: 'preserve-3d',
                  }}
                >
                  <motion.button
                    type="button"
                    data-testid={`nav-${item.id}`}
                    onClick={() => {
                      setActiveNav(item.id);
                      setMobileOpen(false);
                    }}
                    aria-current={isActive ? 'page' : undefined}
                    whileHover={reducedMotion || isActive ? undefined : { x: 4, z: 10 }}
                    whileTap={reducedMotion ? undefined : { scale: 0.99 }}
                    animate={
                      isActive && !reducedMotion
                        ? {
                            boxShadow: [
                              '0 0 12px rgba(0,223,255,0.45), 0 0 22px rgba(7,93,219,0.35)',
                              '0 0 18px rgba(0,240,255,0.72), 0 0 28px rgba(8,127,255,0.50)',
                              '0 0 12px rgba(0,223,255,0.45), 0 0 22px rgba(7,93,219,0.35)',
                            ],
                          }
                        : isActive
                          ? { boxShadow: '0 0 12px rgba(0,223,255,0.45), 0 0 22px rgba(7,93,219,0.35)' }
                          : { boxShadow: '0 0 0px rgba(0,223,255,0)' }
                    }
                    transition={
                      isActive && !reducedMotion
                        ? {
                            boxShadow: {
                              duration: 2.3,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            },
                          }
                        : { duration: 0.16, ease: [0.16, 1, 0.3, 1] }
                    }
                    style={{
                      borderRadius: 'var(--hud-selection-radius, 12px)',
                      transformStyle: 'preserve-3d',
                      background: isActive
                        ? 'linear-gradient(90deg, rgba(7,93,219,0.92) 0%, rgba(8,127,255,0.68) 48%, rgba(0,223,255,0.28) 100%)'
                        : 'transparent',
                    }}
                    className={[
                      'group relative flex h-full min-h-[42px] w-full items-center justify-between gap-2 px-3 py-1.5 text-left transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00F0FF] focus-visible:ring-offset-1 focus-visible:ring-offset-[#02091F]',
                      isActive
                        ? 'border-[1.5px] border-[#00F0FF]'
                        : 'border border-transparent hover:border-[#00DFFF]/30 hover:bg-[#082653]/55',
                    ].join(' ')}
                  >
                    <span
                      className="flex min-w-0 items-center"
                      style={{ gap: 'var(--hud-icon-gap, 14px)' }}
                    >
                      {/* Zone réservée harmonisée de 28 × 28 px pour chaque icône */}
                      <span
                        className="inline-flex shrink-0 items-center justify-center transition-transform duration-150 group-hover:scale-110"
                        style={{
                          width: 'var(--hud-icon-box, 28px)',
                          height: 'var(--hud-icon-box, 28px)',
                          filter: isActive
                            ? 'drop-shadow(0 0 6px rgba(25,239,255,0.85))'
                            : item.id === 'medical-alerts'
                              ? 'drop-shadow(0 0 4px rgba(255,197,46,0.45))'
                              : 'drop-shadow(0 0 3px rgba(185,221,247,0.25))',
                        }}
                      >
                        {item.renderIcon(isActive)}
                      </span>

                      <span
                        className={[
                          'truncate font-sans text-[15px] leading-tight whitespace-nowrap tracking-wide',
                          isActive
                            ? 'font-semibold text-[#F1F7FF]'
                            : 'font-normal text-[#F1F7FF]/90 group-hover:text-[#F1F7FF]',
                        ].join(' ')}
                      >
                        {item.label}
                      </span>
                    </span>

                    <span className="flex shrink-0 items-center gap-1.5">
                      {typeof item.badge === 'number' && (
                        <motion.span
                          data-testid="medical-alert-count"
                          animate={reducedMotion ? { scale: 1 } : { scale: [1, 1.1, 1] }}
                          transition={{
                            duration: 1.7,
                            repeat: reducedMotion ? 0 : Infinity,
                            ease: 'easeInOut',
                          }}
                          aria-label={`${item.badge} medical alerts`}
                          className="flex h-[25px] min-w-[25px] items-center justify-center rounded-full bg-[#FF174F] px-1.5 font-mono text-xs font-bold tabular-nums text-[#F1F7FF] shadow-[0_0_10px_rgba(255,23,79,0.85)]"
                        >
                          {item.badge}
                        </motion.span>
                      )}

                      {isActive && (
                        <motion.span
                          animate={reducedMotion ? { x: 0 } : { x: [0, 4, 0] }}
                          transition={{
                            duration: 1.5,
                            repeat: reducedMotion ? 0 : Infinity,
                            ease: 'easeInOut',
                          }}
                          aria-hidden="true"
                          className="flex items-center text-[#F1F7FF] drop-shadow-[0_0_6px_rgba(0,240,255,0.85)]"
                        >
                          <ChevronsRight size={19} strokeWidth={2} />
                        </motion.span>
                      )}
                    </span>
                  </motion.button>
                </li>
              );
            })}
          </ul>
        </nav>
      </motion.div>
    </aside>
    </>
  );
}

export default CurvedSidebar;
