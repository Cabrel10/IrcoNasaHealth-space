import type { DashboardIndicator } from '@/services/api';
import {
  ageLabel,
  dataClassLabel,
  dataClassVariant,
  observationTimeLabel,
  thresholdStatusLabel,
} from '@/services/dashboardValues';
import { StatusPill } from './StatusPill';

interface IndicatorProvenanceProps {
  indicator?: DashboardIndicator;
}

export function IndicatorProvenance({ indicator }: IndicatorProvenanceProps) {
  if (!indicator) {
    return (
      <p className="text-[11px] font-mono text-gray-400">
        Provenance indisponible : aucune métadonnée d’indicateur reçue.
      </p>
    );
  }

  const freshness = indicator.data_status ?? indicator.status;
  const quality = indicator.measurement_quality ?? indicator.quality ?? 'unknown';
  const dataClass = indicator.value == null ? null : indicator.data_class;

  return (
    <dl
      data-testid={`provenance-${indicator.id}`}
      className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px] font-mono text-gray-300"
    >
      <dt>Classe de données</dt>
      <dd>
        <StatusPill
          label={dataClassLabel(dataClass)}
          variant={dataClassVariant(dataClass)}
        />
      </dd>
      <dt>Source</dt>
      <dd className="break-all text-right">{indicator.source ?? 'UNAVAILABLE'}</dd>
      <dt>Observation</dt>
      <dd className="text-right">{observationTimeLabel(indicator.last_updated)}</dd>
      <dt>Réception par IRCO</dt>
      <dd className="text-right">Non fournie par l’API</dd>
      <dt>Âge de la donnée</dt>
      <dd className="text-right">{ageLabel(indicator.age_seconds)}</dd>
      <dt>Fraîcheur</dt>
      <dd className="text-right">{freshness?.toUpperCase() ?? 'UNAVAILABLE'}</dd>
      <dt>Qualité</dt>
      <dd className="text-right">{quality.toUpperCase()}</dd>
      <dt>Fréquence attendue</dt>
      <dd className="text-right">{indicator.expected_frequency || 'UNAVAILABLE'}</dd>
      <dt>Référence</dt>
      <dd className="text-right">
        {thresholdStatusLabel(indicator.threshold_status)}
      </dd>
      <dt>Transformation</dt>
      <dd className="text-right">Non fournie par l’API</dd>
      <dt>Utilisation dans une alerte</dt>
      <dd className="text-right">Non spécifiée par l’API</dd>
    </dl>
  );
}
