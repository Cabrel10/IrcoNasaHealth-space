import React, { useEffect, useState } from 'react';
import { useMissionStore } from '@/stores/useMissionStore';
import { api, type IndicatorHistory } from '@/services/api';
import { CYLINDER_METRICS, INDICATOR_IDS } from '@/constants/metrics';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusPill } from '@/components/ui/StatusPill';

interface HistoryRow {
  metricId: string;
  label: string;
  color: string;
  data: IndicatorHistory | null;
  error: boolean;
}

/**
 * History & Reports view — every row comes from
 * GET /api/v1/indicators/{id}/history (real series, baseline, trend).
 * No data is invented: an indicator without measurements shows NO DATA.
 */
export const HistoryView: React.FC = () => {
  const { dashboard, dashboardStatus, dashboardDay } = useMissionStore();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const metrics = CYLINDER_METRICS.map((m) => ({
      metricId: m.id,
      label: m.label,
      color: m.color,
      indicatorId: (INDICATOR_IDS[m.id] ?? [])[0],
    })).filter((m) => m.indicatorId);

    // xray_flux_short is intentionally absent from the demo: the row is a real
    // API-backed NO DATA case, never a fabricated zero.
    metrics.push({
      metricId: 'xray',
      label: 'X-Ray Flux',
      color: '#A78BFA',
      indicatorId: 'xray_flux_short',
    });

    Promise.all(
      metrics.map(async (m): Promise<HistoryRow> => {
        try {
          const data = await api.indicatorHistory(m.indicatorId, {
            data_class: 'synthetic',
            scenario: 'a01',
            day: dashboardDay,
          });
          return { metricId: m.metricId, label: m.label, color: m.color, data, error: false };
        } catch {
          return { metricId: m.metricId, label: m.label, color: m.color, data: null, error: true };
        }
      }),
    ).then((result) => {
      if (!cancelled) setRows(result);
    });
    return () => {
      cancelled = true;
    };
  }, [dashboardDay]);

  const sleeping = dashboardStatus === 'loading' || rows === null;
  const dataClass = dashboard?.data_class ?? 'synthetic';

  // trend.slope_per_day can be null even when direction is "insufficient_data"
  // (day 1): never call toFixed on null, and never invent a slope.
  const trendText = (t: IndicatorHistory['trend'] | undefined): string => {
    if (!t) return '—';
    if (typeof t.slope_per_day !== 'number') return t.direction;
    return `${t.direction} (${Number(t.slope_per_day.toFixed(2))}/j)`;
  };

  return (
    <div className="relative w-full h-[calc(100vh-72px)] flex flex-col p-4 lg:p-6 overflow-y-auto select-none">
      {/* Top banner (Medical Truth Rule) */}
      <div className="flex items-center justify-between z-20 px-2 mb-4">
        <div className="flex items-center gap-2">
          <StatusPill label={`DATA: ${dataClass.toUpperCase()}`} variant="synthetic" showDot />
          <StatusPill label={`DAY ${dashboardDay}`} variant="info" showDot />
        </div>
        <div className="text-[11px] font-mono text-cyan-400/80 bg-[#081A30]/80 px-3 py-1 rounded-full border border-[#00CFFF]/25">
          Aide à la décision, pas un diagnostic.
        </div>
      </div>

      <h2 className="font-heading font-bold text-lg text-white tracking-wide px-2 mb-3">
        Historique & Rapports — séries 30 jours (GET /api/v1/indicators/&#123;id&#125;/history)
      </h2>

      <div className="flex flex-col gap-2">
        {sleeping &&
          CYLINDER_METRICS.map((m) => (
            <GlassCard key={m.id} padding="sm" className="text-[11px] font-mono text-[#94b0d1]">
              {m.label} · chargement…
            </GlassCard>
          ))}
        {!sleeping &&
          rows!.map((row) => {
            const n = row.data?.measurements.length ?? 0;
            const baseline = row.data?.baseline;
            const trend = row.data?.trend;
            const last = n > 0 ? Number(row.data!.measurements[n - 1].value) : null;
            return (
              <GlassCard
                key={row.metricId}
                padding="sm"
                className="grid grid-cols-2 md:grid-cols-6 gap-3 items-center text-[11px] font-mono"
                data-testid={`history-${row.metricId}`}
              >
                <div className="flex items-center gap-2 md:col-span-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                  <span className="text-white font-bold uppercase">{row.label}</span>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-[#94b0d1]">Dernière valeur</div>
                  <div className="text-white" data-testid={`history-value-${row.metricId}`}>
                    {last === null ? 'NO DATA' : last}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-[#94b0d1]">Échantillons</div>
                  <div className="text-white">{n}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-[#94b0d1]">Baseline (moy.)</div>
                  <div className="text-white">
                    {baseline ? Number(baseline.mean.toFixed(2)) : 'NO DATA'}
                  </div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-[#94b0d1]">Tendance</div>
                  <div
                    className={
                      trend?.direction === 'rising'
                        ? 'text-[#F59E0B]'
                        : trend?.direction === 'falling'
                        ? 'text-[#00CFFF]'
                        : 'text-gray-400'
                    }
                  >
                    {trendText(trend)}
                  </div>
                </div>
              </GlassCard>
            );
          })}
      </div>
    </div>
  );
};

export default HistoryView;
