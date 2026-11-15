export type MetricStatus = 'normal' | 'stable' | 'warning' | 'critical';

export interface CylinderMetric {
  id: string;
  label: string;
  subtitle: string;
  value: string;
  unit: string;
  status: MetricStatus;
  color: string;
  iconName: string;
  normalRange: string;
  missionAverage: string;
  variability: string;
  history: Array<{ time: string; value: number }>;
}

function genHistory(base: number, variance: number, count: number): Array<{ time: string; value: number }> {
  const pts: Array<{ time: string; value: number }> = [];
  for (let i = 0; i < count; i++) {
    const seed = (i * 7919 + 104729) % 100;
    const v = base + (seed / 100 - 0.5) * variance * 2;
    pts.push({ time: `T-${count - i}h`, value: Math.round(v * 10) / 10 });
  }
  return pts;
}

export const CYLINDER_METRICS: CylinderMetric[] = [
  {
    id: 'heart-rate', label: 'Heart Rate', subtitle: 'Cardiovascular',
    value: '68', unit: 'bpm', status: 'normal', color: '#FF2D55', iconName: 'Heart',
    normalRange: '60 - 100 BPM', missionAverage: '72 BPM', variability: '3.8 ms',
    history: genHistory(68, 8, 20),
  },
  {
    id: 'spo2', label: 'SpO₂', subtitle: 'Blood Oxygen',
    value: '98', unit: '%', status: 'normal', color: '#00CFFF', iconName: 'Droplets',
    normalRange: '95 - 100%', missionAverage: '98.2%', variability: '±0.4%',
    history: genHistory(98, 2, 20),
  },
  {
    id: 'blood-pressure', label: 'Blood Pressure', subtitle: 'Arterial',
    value: '118/76', unit: 'mmHg', status: 'normal', color: '#22C55E', iconName: 'Activity',
    normalRange: '90-120/60-80', missionAverage: '116/76', variability: '±3%',
    history: genHistory(118, 6, 20),
  },
  {
    id: 'body-temp', label: 'Body Temp', subtitle: 'Thermoregulation',
    value: '36.6', unit: '°C', status: 'normal', color: '#F59E0B', iconName: 'Thermometer',
    normalRange: '36.5 - 37.5°C', missionAverage: '36.7°C', variability: '±0.2°C',
    history: genHistory(36.6, 0.4, 20),
  },
  {
    id: 'respiratory-rate', label: 'Resp. Rate', subtitle: 'Respiratory',
    value: '16', unit: 'br/min', status: 'normal', color: '#A78BFA', iconName: 'Wind',
    normalRange: '12 - 20 br/min', missionAverage: '15.4', variability: '±1.2',
    history: genHistory(16, 3, 20),
  },
  {
    id: 'sleep-quality', label: 'Sleep Quality', subtitle: 'Sleep',
    value: '94', unit: '/100', status: 'normal', color: '#818CF8', iconName: 'Moon',
    normalRange: '60 - 100', missionAverage: '88', variability: '±5',
    history: genHistory(94, 4, 20),
  },
];

/**
 * Mapping UI metric id → backend indicator ids (GET /api/v1/indicators registry).
 * Values displayed in the UI MUST come from these indicators — never invented.
 */
export const INDICATOR_IDS: Record<string, string[]> = {
  'heart-rate': ['heart_rate'],
  'spo2': ['spo2'],
  'blood-pressure': ['blood_pressure_systolic', 'blood_pressure_diastolic'],
  'body-temp': ['body_temperature'],
  'respiratory-rate': ['respiratory_rate'],
  'sleep-quality': ['sleep_quality'],
  'core-temp': ['body_temperature'],
};

export const VITAL_INDICATOR_IDS: Record<string, string[]> = {
  ...INDICATOR_IDS,
};

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  status: 'healthy' | 'monitoring';
  statusColor: string;
  initials: string;
}

export const CREW_MEMBERS: CrewMember[] = [
  { id: 'davis', name: 'Cmdr. Davis', role: 'Commander', status: 'healthy', statusColor: '#22C55E', initials: 'CD' },
  { id: 'nguyen', name: 'Dr. Nguyen', role: 'Medical Officer', status: 'healthy', statusColor: '#22C55E', initials: 'DN' },
  { id: 'garcia', name: 'Lt. Garcia', role: 'Pilot', status: 'monitoring', statusColor: '#F59E0B', initials: 'LG' },
  { id: 'williams', name: 'Spec. Williams', role: 'Engineer', status: 'healthy', statusColor: '#22C55E', initials: 'SW' },
];

export interface VitalCard {
  id: string;
  label: string;
  value: string;
  unit: string;
  status: MetricStatus;
  color: string;
  iconName: string;
  history: number[];
}

export const VITALS_CARDS: VitalCard[] = [
  { id: 'heart-rate', label: 'Heart Rate', value: '68', unit: 'bpm', status: 'normal', color: '#FF2D55', iconName: 'Heart', history: [65, 68, 70, 67, 69, 68, 72, 68, 66, 68] },
  { id: 'spo2', label: 'SpO₂', value: '98', unit: '%', status: 'normal', color: '#00CFFF', iconName: 'Droplets', history: [97, 98, 99, 98, 97, 98, 98, 99, 98, 98] },
  { id: 'blood-pressure', label: 'Blood Pressure', value: '118/76', unit: 'mmHg', status: 'normal', color: '#22C55E', iconName: 'Activity', history: [116, 118, 120, 117, 118, 119, 118, 116, 118, 118] },
  { id: 'core-temp', label: 'Core Temp', value: '36.6', unit: '°C', status: 'normal', color: '#F59E0B', iconName: 'Thermometer', history: [36.5, 36.6, 36.7, 36.6, 36.5, 36.6, 36.7, 36.6, 36.6, 36.6] },
  { id: 'sleep-quality', label: 'Sleep Quality', value: '94', unit: '%', status: 'normal', color: '#A78BFA', iconName: 'Moon', history: [90, 92, 94, 93, 95, 94, 92, 93, 94, 94] },
];

export interface BottomMetric {
  id: string;
  label: string;
  type: 'gauge' | 'chart' | 'ring' | 'timeline';
  value: number;
  max: number;
  unit: string;
  color: string;
}

export const BOTTOM_ROW: BottomMetric[] = [
  { id: 'radiation', label: 'Radiation', type: 'gauge', value: 12.4, max: 30, unit: 'mSv', color: '#F59E0B' },
  { id: 'muscle-bone', label: 'Muscle & Bone', type: 'chart', value: 0, max: 100, unit: '%', color: '#A78BFA' },
  { id: 'hydration', label: 'Hydration', type: 'ring', value: 78, max: 100, unit: '%', color: '#00CFFF' },
  { id: 'stress', label: 'Stress Level', type: 'ring', value: 22, max: 100, unit: '/100', color: '#F59E0B' },
  { id: 'timeline', label: 'Mission Timeline', type: 'timeline', value: 139, max: 142, unit: 'D+', color: '#00CFFF' },
];
