// ─── API Service Layer ──────────────────────────────────────────────────────
// Consumes ONLY routes from openapi.json on backend port 3080

const API_BASE = '/api/v1';

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw { status: res.status, ...body };
  }
  return res.json();
}

// ─── Types mirroring the API contract (frontdev.md §5-7) ────────────────────

export interface DashboardIndicator {
  id: string;
  value: number | null;
  unit: string;
  last_updated: string | null;
  source: string | null;
  quality: string;
  measurement_quality: string;
  data_class: DataClass;
  status: string;
  data_status: string;
  history: Array<{ timestamp: string; value: number }>;
  baseline: { mean: number; median: number; sample_count: number; standard_deviation: number } | null;
  trend?: { direction: string; slope_per_day: number | null } | null;
  thresholds: {
    reference_min?: number | null;
    reference_max?: number | null;
    reference_source?: string | null;
    status?: string;
  } | null;
  threshold_status: 'validated' | 'provisional' | 'illustrative' | 'not_applicable';
  expected_frequency: string;
  age_seconds: number | null;
  spark: number[];
}

export type DataClass = 'measured_real' | 'analog' | 'synthetic';

export interface DashboardGlobal {
  level: 'green' | 'amber' | 'red' | 'no_data';
  confidence: string;
  badges: string[];
}

export interface DashboardMission {
  mission_id: string;
  mission_day: number;
  duration_days?: number;
  environment: string;
  mode?: string;
  simulated?: boolean;
  earth_delay_min?: number;
}

export interface DashboardAlert {
  id: string;
  state: string;
  persistence: string;
  vigilance?: string;
  triggered_rules?: string[];
  actions?: string[];
  data_class?: DataClass;
}

export interface DashboardHazard {
  id: string;
  level: DashboardGlobal['level'];
  indicators: string[];
}

export interface DashboardResponse {
  mode: string;
  subject_id: string;
  data_class: DataClass;
  global: DashboardGlobal;
  indicators: DashboardIndicator[];
  data_quality: { data_class: string; valid: number; suspect: number; no_data: number };
  services: { engine: string; ai: string; knowledge: string };
  mission?: DashboardMission;
  last_updated?: string;
  medical_notice?: string;
  active_alerts?: DashboardAlert[];
  triggered_rules: string[];
  hazards: DashboardHazard[];
  anomalies: { available: boolean; items: unknown[]; reason: string };
  clinical_assessment: { available: boolean; diagnoses: unknown[]; reason: string };
  routine: {
    subject_id: string;
    date: string;
    tasks: Array<{ id: string; name: string; completed: boolean; [key: string]: unknown }>;
    progress: { completed: number; total: number; percentage: number };
  };
}

export interface MissionInfo {
  mission_id: string;
  duration_days: number;
  crew_size: number;
  subject_id: string;
  environment: string;
  simulated: boolean;
}

export interface IndicatorMeta {
  id: string;
  name: string;
  unit: string;
  family: string;
  collection_method: string;
  expected_frequency: string;
  reference_min: number | null;
  reference_max: number | null;
  reference_status: string;
}

export interface DemoScenario {
  id: string;
  data_class: 'synthetic';
  days: number;
  description: string;
}

export interface AssistantCitation {
  document_id: string;
  title: string;
  publisher?: string;
  url?: string | null;
  section?: string | null;
  page_numbers?: number[] | null;
}

export interface AssistantResponse {
  answer: string;
  citations: AssistantCitation[];
  disclaimer: string;
  provider: string;
  source_not_found: boolean;
}

export interface IndicatorHistory {
  subject_id: string;
  indicator: string;
  unit: string;
  data_class: string;
  baseline: { mean: number; median: number; sample_count: number; standard_deviation: number } | null;
  trend: { direction: string; slope_per_day: number | null } | null;
  thresholds: { reference_min: number; reference_max: number; reference_source: string; status: string } | null;
  data_quality: { valid: number; suspect: number; total: number };
  measurements: Array<{ timestamp: string; value: number; quality: string; source: string }>;
}

export interface AlertItem {
  id: string;
  state: string;
  subject_id: string;
  indicator: string;
  detail: string;
}

export interface HealthStatus {
  status: string;
  version: string;
  database: string;
  rules_loaded: number;
  indicators_loaded: number;
  ai_available: boolean;
  colab_available: boolean;
  knowledge_available: boolean;
}

// ─── API Functions ──────────────────────────────────────────────────────────

export const api = {
  health: () => fetchJSON<HealthStatus>('/health'),

  dashboard: (params?: { mode?: string; subject_id?: string; scenario?: string; day?: number; data_class?: string }) => {
    const qs = new URLSearchParams();
    if (params?.mode) qs.set('mode', params.mode);
    if (params?.subject_id) qs.set('subject_id', params.subject_id);
    if (params?.scenario) qs.set('scenario', params.scenario);
    if (params?.day !== undefined) qs.set('day', String(params.day));
    if (params?.data_class) qs.set('data_class', params.data_class);
    const q = qs.toString();
    return fetchJSON<DashboardResponse>(`/dashboard${q ? '?' + q : ''}`);
  },

  mission: () => fetchJSON<MissionInfo>('/mission'),

  indicators: () => fetchJSON<IndicatorMeta[]>('/indicators'),

  indicatorDetail: (id: string) => fetchJSON<IndicatorMeta>(`/indicators/${id}`),

  indicatorHistory: (id: string, params: { data_class: string; subject_id?: string; scenario?: string; day?: number }) => {
    const qs = new URLSearchParams({ data_class: params.data_class });
    if (params.subject_id) qs.set('subject_id', params.subject_id);
    if (params.scenario) qs.set('scenario', params.scenario);
    if (params.day !== undefined) qs.set('day', String(params.day));
    return fetchJSON<IndicatorHistory>(`/indicators/${id}/history?${qs}`);
  },

  alerts: (params?: { subject_id?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.subject_id) qs.set('subject_id', params.subject_id);
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.offset) qs.set('offset', String(params.offset));
    const q = qs.toString();
    return fetchJSON<{ alerts: AlertItem[]; limit: number; offset: number }>(`/alerts${q ? '?' + q : ''}`);
  },

  checkin: (data: { subject_id: string; indicator: string; value: number; unit: string; timestamp?: string }) =>
    fetchJSON<{ measurement_id: string; status: string }>('/checkin', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  assistantChat: (data: { question: string; hazard?: string; indicator?: string; subject_id?: string; data_class?: string }) =>
    fetchJSON<AssistantResponse>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  demoScenarios: () => fetchJSON<DemoScenario[]>('/demo/scenarios'),

  dashboardSSE: (params: { subject_id?: string; data_class: string }) => {
    const qs = new URLSearchParams({ data_class: params.data_class });
    if (params.subject_id) qs.set('subject_id', params.subject_id);
    return new EventSource(`${API_BASE}/dashboard/events?${qs}`);
  },
};
