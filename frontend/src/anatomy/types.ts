export type AnatomicalSystemId =
  | 'skin'
  | 'muscular'
  | 'skeletal'
  | 'organs'
  | 'cardiovascular'
  | 'nervous';

export type CameraPresetId = 'anterior' | 'thoracic' | 'lateral' | 'posterior';

export type LayerVisibilityState = Record<AnatomicalSystemId, boolean>;

export type DiagnosticSliceMode = 'axial' | 'sagittal';

export type AnomalyZoneId =
  | 'liver_metabolic'
  | 'left_knee_joint'
  | 'right_forearm_strain';

export interface DiagnosticState {
  anomaliesEnabled: boolean;
  activeAnomalies: Record<AnomalyZoneId, boolean>;
  sliceEnabled: boolean;
  sliceMode: DiagnosticSliceMode;
  slicePos: number;
}

export interface AnomalyZoneMeta {
  id: AnomalyZoneId;
  label: string;
  partIds: string[];
  condition: string;
  severityLabel: string;
  accentHex: string;
  focusY: number;
}

export interface AnatomicalPartInfo {
  id: string;
  name: string;
  latinName: string;
  system: AnatomicalSystemId;
  region: string;
  summary: string;
  vascularSupply: string;
  innervation: string;
}

export interface SystemMeta {
  id: AnatomicalSystemId;
  label: string;
  accentHex: string;
}

export const ANATOMICAL_SYSTEMS: SystemMeta[] = [
  { id: 'organs', label: 'Organs', accentHex: '#38BDF8' },
  { id: 'skeletal', label: 'Skeletal', accentHex: '#7DD3FC' },
  { id: 'muscular', label: 'Muscular', accentHex: '#3B82F6' },
  { id: 'cardiovascular', label: 'Cardiovascular', accentHex: '#D93829' },
  { id: 'nervous', label: 'Nervous', accentHex: '#22D3EE' },
  { id: 'skin', label: 'Holo Skin', accentHex: '#60A5FA' },
];

export const ANOMALY_ZONES: AnomalyZoneMeta[] = [
  {
    id: 'liver_metabolic',
    label: 'Hepatic',
    partIds: ['liver'],
    condition: 'Focal Hepatic Metabolic Alteration',
    severityLabel: 'Modified · Warning',
    accentHex: '#FF6B1A',
    focusY: 1.195,
  },
  {
    id: 'left_knee_joint',
    label: 'Left Knee',
    partIds: ['lower_limb_bones', 'leg_muscles'],
    condition: 'Left Patellofemoral Articular Inflammation',
    severityLabel: 'Altered · Critical',
    accentHex: '#D926A9',
    focusY: 0.505,
  },
  {
    id: 'right_forearm_strain',
    label: 'R. Forearm',
    partIds: ['upper_limb_bones', 'arm_muscles'],
    condition: 'Right Antebrachial Perfusion Variance',
    severityLabel: 'Modified · Advisory',
    accentHex: '#FF8C1A',
    focusY: 0.97,
  },
];
