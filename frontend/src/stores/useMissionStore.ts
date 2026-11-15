import { create } from 'zustand';
import { api, type DashboardResponse } from '@/services/api';

export type DashboardStatus = 'idle' | 'loading' | 'ok' | 'error';

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

  // ─── Real backend state (single source of truth) ──────────────────────────
  dashboard: DashboardResponse | null;
  dashboardStatus: DashboardStatus;
  dashboardError: string | null;
  dashboardDay: number;
  loadDashboard: () => Promise<void>;
  setDashboardDay: (day: number) => void;
}

export const DEMO_SCENARIO = 'a01';
export const DEMO_DAYS = 124;

export const useMissionStore = create<MissionState>((set, get) => ({
  missionName: 'IRCO-DEMO',
  crewSize: 1,
  chronoSeconds: 45296,
  activeNavId: 'mission-overview',
  selectedMetricId: 'heart-rate',
  introDone: sessionStorage.getItem('icorp-intro-done') === 'true',
  selectedCrewId: 'a01',
  tickChrono: () => set((s) => ({ chronoSeconds: s.chronoSeconds + 1 })),
  setActiveNav: (id) => set({ activeNavId: id }),
  setSelectedMetric: (id) => set({ selectedMetricId: id }),
  setIntroDone: (done) => {
    if (done) sessionStorage.setItem('icorp-intro-done', 'true');
    set({ introDone: done });
  },
  setSelectedCrew: (id) => set({ selectedCrewId: id }),

  dashboard: null,
  dashboardStatus: 'idle',
  dashboardError: null,
  // Deep-link support: /?day=97 opens the demo on that mission day.
  dashboardDay: (() => {
    const raw = Number(new URLSearchParams(window.location.search).get('day'));
    if (!Number.isFinite(raw) || raw < 1) return 1;
    return Math.min(Math.round(raw), DEMO_DAYS);
  })(),
  loadDashboard: async () => {
    const day = get().dashboardDay;
    set({ dashboardStatus: 'loading', dashboardError: null });
    try {
      const data = await api.dashboard({
        mode: 'demo',
        scenario: DEMO_SCENARIO,
        day,
        data_class: 'synthetic',
      });
      set({
        dashboard: data,
        dashboardStatus: 'ok',
        missionName: data.mission?.mission_id ?? get().missionName,
        crewSize: 1,
      });
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'error' in err
          ? String((err as { error: unknown }).error)
          : 'Backend unreachable';
      set({ dashboardStatus: 'error', dashboardError: message, dashboard: null });
    }
  },
  setDashboardDay: (day) => {
    const clamped = Math.min(Math.max(1, Math.round(day)), DEMO_DAYS);
    if (clamped === get().dashboardDay) return;
    set({ dashboardDay: clamped });
    void get().loadDashboard();
  },
}));
