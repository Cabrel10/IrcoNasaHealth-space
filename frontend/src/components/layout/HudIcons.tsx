import React from 'react';
import { Bed, Brain, HeartPulse, Rocket } from 'lucide-react';

export interface HudIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * 1. Mission Overview — Fusée orientée vers le haut et la droite
 */
export function MissionRocketIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <Rocket
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  );
}

/**
 * 2. Crew Health — Cœur médical avec signal électrocardiographique
 */
export function CrewHeartPulseIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <HeartPulse
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  );
}

/**
 * 3. Cardiovascular — Goutte médicale intégrant un tracé cardiaque
 */
export function CardiovascularIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2.75C12 2.75 5.75 9.85 5.75 14.35a6.25 6.25 0 0 0 12.5 0C18.25 9.85 12 2.75 12 2.75z" />
      <path d="M8.3 14.5h1.85l1.05-2.1 1.55 3.7 1.2-2.35.85.75h1.1" />
    </svg>
  );
}

/**
 * 4. Neurological — Cerveau humain détaillé et reconnaissable
 */
export function NeurologicalBrainIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <Brain
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  );
}

/**
 * 5. Respiratory — Poumons symétriques avec trachée centrale
 */
export function RespiratoryLungsIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v7.4" />
      <path d="M12 10.2 9.1 12.3" />
      <path d="M12 10.2 14.9 12.3" />
      <path d="M9.6 8.8C6.6 8.8 4 11.7 4 15.7c0 2.4 1.3 4.2 3.3 4.2 1.6 0 2.6-1.1 2.6-2.9v-6.2" />
      <path d="M14.4 8.8c3 0 5.6 2.9 5.6 6.9 0 2.4-1.3 4.2-3.3 4.2-1.6 0-2.6-1.1-2.6-2.9v-6.2" />
    </svg>
  );
}

/**
 * 6. Sleep & Fatigue — Lit minimaliste vu de profil
 */
export function SleepBedIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <Bed
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      aria-hidden="true"
    />
  );
}

/**
 * 7. Medical Alerts — Triangle d'avertissement (#FFC52E) avec point d'exclamation
 */
export function MedicalAlertsIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M10.7 3.9 2.45 18.35A1.5 1.5 0 0 0 3.75 20.6h16.5a1.5 1.5 0 0 0 1.3-2.25L13.3 3.9a1.5 1.5 0 0 0-2.6 0z"
        fill="#FFC52E"
        stroke="#FFD86B"
        strokeWidth={1.1}
        strokeLinejoin="round"
      />
      <path
        d="M12 9.4v4.5"
        stroke="#02091F"
        strokeWidth={strokeWidth + 0.15}
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.15" r="1.1" fill="#02091F" />
    </svg>
  );
}

/**
 * 8. History & Reports — Trois barres verticales croissantes
 */
export function HistoryReportsIcon({
  size = 20,
  strokeWidth = 1.85,
  className = '',
}: HudIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="4.5" y="13" width="3.5" height="6.8" rx="0.9" />
      <rect x="10.25" y="9" width="3.5" height="10.8" rx="0.9" />
      <rect x="16" y="4.5" width="3.5" height="15.3" rx="0.9" />
    </svg>
  );
}
