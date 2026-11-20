export interface NavItem {
  id: string;
  label: string;
  iconName: string;
  alertCount?: number;
}

export const COCKPIT_NAV_ITEMS: NavItem[] = [
  { id: 'mission-overview', label: 'Mission Overview', iconName: 'Rocket' },
  { id: 'crew-health', label: 'Crew Health', iconName: 'Activity' },
  { id: 'anatomy', label: '3D Anatomy Explorer', iconName: 'Atom' },
  { id: 'cardiovascular', label: 'Cardiovascular', iconName: 'Heart' },
  { id: 'neurological', label: 'Neurological', iconName: 'Brain' },
  { id: 'respiratory', label: 'Respiratory', iconName: 'Wind' },
  { id: 'sleep-fatigue', label: 'Sleep & Fatigue', iconName: 'Moon' },
  { id: 'medical-alerts', label: 'Medical Alerts', iconName: 'AlertTriangle' },
  { id: 'history-reports', label: 'History & Reports', iconName: 'FileText' },
];
