import { create } from 'zustand';

export interface MissionState {
  missionName: string;
  crewSize: number;
  chronoSeconds: number;
  activeNavId: string;
  setActiveNav: (id: string) => void;
  selectedMetricId: string;
  setSelectedMetric: (id: string) => void;
  introDone: boolean;
  setIntroDone: (done: boolean) => void;
  selectedCrewId: string;
  setSelectedCrew: (id: string) => void;
  tickChrono: () => void;
}

export const useMissionStore = create<MissionState>((set) => ({
  missionName: 'Apollo-7',
  crewSize: 4,
  chronoSeconds: 45296,
  activeNavId: sessionStorage.getItem('icorp-intro-done') === 'true' ? 'mission-overview' : 'mission-overview',
  selectedMetricId: 'heart-rate',
  introDone: sessionStorage.getItem('icorp-intro-done') === 'true',
  selectedCrewId: 'davis',
  tickChrono: () => set((s) => ({ chronoSeconds: s.chronoSeconds + 1 })),
  setActiveNav: (id) => set({ activeNavId: id }),
  setSelectedMetric: (id) => set({ selectedMetricId: id }),
  setIntroDone: (done) => {
    if (done) sessionStorage.setItem('icorp-intro-done', 'true');
    set({ introDone: done });
  },
  setSelectedCrew: (id) => set({ selectedCrewId: id }),
}));
