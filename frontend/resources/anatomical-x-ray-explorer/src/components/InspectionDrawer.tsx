import { X } from 'lucide-react';
import { ANATOMICAL_CATALOG } from '../anatomy/catalog';
import {
  ANATOMICAL_SYSTEMS,
  ANOMALY_ZONES,
  DiagnosticState,
} from '../anatomy/types';

interface InspectionDrawerProps {
  partId: string | null;
  diagnostics: DiagnosticState;
  onClose: () => void;
  onIsolateSystem: (system: (typeof ANATOMICAL_SYSTEMS)[number]['id']) => void;
}

export function InspectionDrawer({
  partId,
  diagnostics,
  onClose,
  onIsolateSystem,
}: InspectionDrawerProps) {
  if (!partId) return null;
  const info = ANATOMICAL_CATALOG[partId];
  if (!info) return null;

  const systemMeta = ANATOMICAL_SYSTEMS.find((s) => s.id === info.system);
  const matchedAnomaly = diagnostics.anomaliesEnabled
    ? ANOMALY_ZONES.find(
        (z) => z.partIds.includes(partId) && diagnostics.activeAnomalies[z.id],
      )
    : undefined;

  return (
    <aside
      aria-label="Anatomical Structure Inspection"
      className="pointer-events-auto absolute left-5 bottom-36 z-20 w-[335px] max-w-[calc(100vw-2.5rem)] rounded-xl border border-sky-400/20 p-4 text-slate-100 shadow-2xl"
      style={{ backgroundColor: 'rgba(11, 17, 32, 0.92)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-sm"
              style={{ backgroundColor: systemMeta?.accentHex ?? '#38BDF8' }}
              aria-hidden="true"
            />
            <span className="truncate">{systemMeta?.label}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">{info.region}</span>
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-white">
            {info.name}
          </h2>
          <p className="text-xs italic text-sky-300/80">{info.latinName}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close inspection panel"
          className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {matchedAnomaly && (
        <div className="mt-2.5 border-t border-slate-800/90 pt-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-medium text-slate-100">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: matchedAnomaly.accentHex }}
                aria-hidden="true"
              />
              {matchedAnomaly.condition}
            </span>
          </div>
          <p
            className="mt-0.5 text-[11px] font-medium"
            style={{ color: matchedAnomaly.accentHex }}
          >
            Status: {matchedAnomaly.severityLabel}
          </p>
        </div>
      )}

      <p className="mt-2.5 text-xs leading-relaxed text-slate-300">
        {info.summary}
      </p>

      <div className="mt-3 space-y-1.5 border-t border-slate-800/90 pt-2.5 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-400 shrink-0">Vascular Supply</span>
          <span className="text-right text-slate-200">{info.vascularSupply}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-slate-400 shrink-0">Innervation</span>
          <span className="text-right text-slate-200">{info.innervation}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => onIsolateSystem(info.system)}
          className="rounded-lg border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-300 hover:bg-sky-500/20 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          Isolate {systemMeta?.label}
        </button>
      </div>
    </aside>
  );
}
