import hazardMap from '../../../../data/hazard_map.json';
import type { DashboardHazard } from '@/services/api';
import type { IndicatorMap } from '@/services/dashboardValues';
import {
  dataClassLabel,
  dataClassVariant,
  fmtValue,
} from '@/services/dashboardValues';
import { StatusPill } from '@/components/ui/StatusPill';

const LEVEL_VARIANTS = {
  green: 'nominal',
  amber: 'warning',
  red: 'critical',
  no_data: 'nodata',
} as const;

interface HazardEvidencePanelProps {
  hazards?: DashboardHazard[];
  indicators: IndicatorMap;
}

export function HazardEvidencePanel({
  hazards,
  indicators,
}: HazardEvidencePanelProps) {
  const hazardById = new Map((hazards ?? []).map((hazard) => [hazard.id, hazard]));

  return (
    <section
      aria-label="Mission hazard evidence"
      data-testid="mission-hazard-evidence"
      className="rounded-xl border border-[#00CFFF]/20 bg-[#061329]/75 p-3"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
          Contexte des dangers de mission
        </h2>
        <span className="text-[9px] font-mono text-gray-400">
          Couverture documentaire, pas un score de risque
        </span>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {hazardMap.hazards.map((mapping) => {
          const hazard = hazardById.get(mapping.id);
          const level = hazard?.level ?? 'no_data';
          const evidenceLabel =
            mapping.coverage === 'partial'
              ? 'PARTIAL EVIDENCE'
              : 'NO CURATED EVIDENCE';

          return (
            <article
              key={mapping.id}
              className="min-w-0 rounded-lg border border-white/10 bg-black/20 p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <h3 className="text-[10px] font-mono font-semibold uppercase text-[#dceaff]">
                  {mapping.id.replaceAll('_', ' ')}
                </h3>
                <StatusPill
                  label={level === 'no_data' ? 'UNAVAILABLE' : level.toUpperCase()}
                  variant={LEVEL_VARIANTS[level]}
                />
              </div>
              <div className="mt-1 text-[9px] font-mono text-gray-400">
                {evidenceLabel}
              </div>
              {mapping.indicators.length > 0 ? (
                <ul className="mt-1 space-y-0.5">
                  {mapping.indicators.map((id) => {
                    const indicator = indicators.get(id);
                    const value =
                      indicator?.value == null
                        ? 'UNAVAILABLE'
                        : `${fmtValue(indicator.value)} ${indicator.unit}`;
                    const state =
                      indicator?.value == null
                        ? 'UNAVAILABLE'
                        : dataClassLabel(indicator.data_class);

                    return (
                      <li
                        key={id}
                        className="flex flex-wrap items-center justify-between gap-x-1 text-[9px] font-mono"
                      >
                        <span className="text-gray-400">{id}</span>
                        <span className="text-gray-200">{value}</span>
                        {indicator?.value != null && (
                          <StatusPill
                            label={state}
                            variant={dataClassVariant(indicator.data_class)}
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-1 text-[9px] font-mono text-gray-500">
                  No linked measure in this snapshot.
                </p>
              )}
              {mapping.note && (
                <p className="mt-1 text-[9px] leading-snug text-gray-500">
                  {mapping.note}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
