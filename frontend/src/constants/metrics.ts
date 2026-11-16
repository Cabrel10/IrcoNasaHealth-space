export interface MetricPresentation {
  id: string;
  label: string;
  subtitle: string;
  unit: string;
  color: string;
  iconName: string;
}

export const CYLINDER_METRICS: MetricPresentation[] = [
  {
    id: 'heart-rate', label: 'Heart Rate', subtitle: 'Cardiovascular',
    unit: 'bpm', color: '#FF2D55', iconName: 'Heart',
  },
  {
    id: 'spo2', label: 'SpO₂', subtitle: 'Blood Oxygen',
    unit: '%', color: '#00CFFF', iconName: 'Droplets',
  },
  {
    id: 'blood-pressure', label: 'Blood Pressure', subtitle: 'Arterial',
    unit: 'mmHg', color: '#22C55E', iconName: 'Activity',
  },
  {
    id: 'body-temp', label: 'Body Temp', subtitle: 'Thermoregulation',
    unit: '°C', color: '#F59E0B', iconName: 'Thermometer',
  },
  {
    id: 'respiratory-rate', label: 'Resp. Rate', subtitle: 'Respiratory',
    unit: 'br/min', color: '#A78BFA', iconName: 'Wind',
  },
  {
    id: 'sleep-quality', label: 'Sleep Quality', subtitle: 'Sleep',
    unit: '/100', color: '#818CF8', iconName: 'Moon',
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
  status: 'healthy' | 'monitoring' | 'unavailable';
  statusColor: string;
  initials: string;
}

export const VITALS_CARDS: MetricPresentation[] = [
  CYLINDER_METRICS[0],
  CYLINDER_METRICS[1],
  CYLINDER_METRICS[2],
  CYLINDER_METRICS[3],
  CYLINDER_METRICS[5],
];
