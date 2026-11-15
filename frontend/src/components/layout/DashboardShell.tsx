import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SpaceBackground } from '@/components/layout/SpaceBackground';
import { TopBar } from '@/components/layout/TopBar';
import { SideNavigation } from '@/components/layout/SideNavigation';
import { IntroSequence } from '@/components/layout/IntroSequence';
import { CockpitView } from '@/components/views/CockpitView';
import { CrewHealthView } from '@/components/views/CrewHealthView';
import { useMissionStore } from '@/stores/useMissionStore';

export const DashboardShell: React.FC = () => {
  const { activeNavId, introDone, dashboardDay, loadDashboard } = useMissionStore();
  const [isTransitioning, setIsTransitioning] = useState(false);

  const isCrewView = activeNavId === 'crew-health';

  // Fetch the real dashboard from the IRCO backend on load and on day change.
  useEffect(() => {
    void loadDashboard();
  }, [dashboardDay, loadDashboard]);

  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 600);
    return () => clearTimeout(timer);
  }, [activeNavId]);

  return (
    <div className="relative flex h-screen w-screen select-none flex-col overflow-hidden bg-[#01040c] font-heading text-[#f4f8ff]">
      {/* 1. Deep-Space Backdrop (Persistent across views) */}
      <SpaceBackground />

      {/* 2. Intro Sequence (Skippable, plays once per session) */}
      {!introDone && <IntroSequence />}

      {/* 3. TopBar (Fixed 72px with variants A & B) */}
      <TopBar />

      {/* 4. SideNavigation (Curved Cockpit menu <-> Compact Crew rail) */}
      <SideNavigation />

      {/* 5. Main Content Area with View Transition */}
      <motion.main
        layout
        transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
        className={`relative z-10 flex h-[calc(100vh-72px)] flex-1 flex-col overflow-hidden transition-all duration-500 ${
          isCrewView ? 'pl-[80px]' : 'pl-[290px]'
        } ${isTransitioning ? 'pointer-events-none' : ''}`}
      >
        <AnimatePresence mode="wait">
          {!isCrewView ? (
            /* VIEW A: COCKPIT / MISSION OVERVIEW */
            <motion.div
              key="cockpit-view"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.4 } }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              <CockpitView />
            </motion.div>
          ) : (
            /* VIEW B: CREW HEALTH */
            <motion.div
              key="crew-health-view"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.4 } }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="w-full h-full"
            >
              <CrewHealthView />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>
    </div>
  );
};

export default DashboardShell;
