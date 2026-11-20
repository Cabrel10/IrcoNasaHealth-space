import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, CheckCircle2, Info } from 'lucide-react';
import { useMissionStore } from '@/stores/useMissionStore';
import { GlassCard } from '@/components/ui/GlassCard';
import { StatusPill } from '@/components/ui/StatusPill';

/**
 * Medical Alerts view — real alert lifecycle from the IRCO API only
 * (GET /dashboard → active_alerts + triggered_rules). No invented alert.
 */
export const AlertsView: React.FC = () => {
  const { dashboard, dashboardStatus, dashboardDay } = useMissionStore();
  const sleeping = dashboardStatus === 'loading';
  const alerts = dashboard?.active_alerts ?? [];
  const triggered = dashboard?.triggered_rules ?? [];

  return (
    <div className="relative w-full h-[calc(100vh-72px)] flex flex-col p-4 lg:p-6 overflow-y-auto select-none">
      {/* Top banner (Medical Truth Rule) */}
      <div className="flex items-center justify-between z-20 px-2 mb-4">
        <div className="flex items-center gap-2">
          <StatusPill
            label={`DATA: ${(dashboard?.data_class ?? '…').toUpperCase()}`}
            variant="synthetic"
            showDot
          />
          <StatusPill label={`DAY ${dashboardDay}`} variant="info" showDot />
        </div>
        <div className="text-[11px] font-mono text-cyan-400/80 bg-[#081A30]/80 px-3 py-1 rounded-full border border-[#00CFFF]/25">
          Aide à la décision, pas un diagnostic.
        </div>
      </div>

      <h2 className="font-heading font-bold text-lg text-white tracking-wide px-2 mb-3">
        Alertes Médicales Actives
      </h2>

      {sleeping ? (
        <GlassCard padding="md" className="text-[#94b0d1] font-mono text-sm">
          Chargement depuis l'API IRCO…
        </GlassCard>
      ) : alerts.length === 0 ? (
        <GlassCard padding="md" className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="w-5 h-5 text-[#22C55E]" />
          <div>
            <div className="font-heading font-bold text-white">Aucune alerte active</div>
            <div className="text-[11px] font-mono text-[#94b0d1] mt-0.5">
              Jour {dashboardDay} · vigilance {dashboard?.global?.level ?? 'no_data'} · source:
              GET /api/v1/dashboard → active_alerts
            </div>
          </div>
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">
          {alerts.map((a, i) => (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4 }}
            >
              <GlassCard padding="md" className="border-[#FF2D55]/40" data-testid={`alert-${a.id}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-[#FF2D55] font-semibold text-sm">
                    <ShieldAlert className="w-4 h-4" />
                    <span>{a.id}</span>
                  </div>
                  <StatusPill label={`VIGILANCE: ${(a.vigilance ?? '—').toUpperCase()}`} variant="critical" showDot />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] font-mono text-[#94b0d1]">
                  <div>
                    <div className="text-[9px] uppercase">État</div>
                    <div className="text-white">{a.state}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase">Persistance</div>
                    <div className="text-white">{a.persistence}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase">Classe de données</div>
                    <div className="text-white">{a.data_class ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase">Actions</div>
                    <div className="text-white">{(a.actions ?? []).join(', ') || '—'}</div>
                  </div>
                </div>
                {(a.triggered_rules ?? []).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-white/10 text-[11px] font-mono">
                    <span className="text-[#00CFFF]">Règles déclenchées: </span>
                    <span className="text-white">{(a.triggered_rules ?? []).join(' · ')}</span>
                  </div>
                )}
              </GlassCard>
            </motion.div>
          ))}
        </div>
      )}

      {/* Rules evaluated this day (traceability) */}
      <h3 className="font-heading font-bold text-sm text-white tracking-wide px-2 mt-6 mb-2">
        Règles déclenchées aujourd'hui ({triggered.length})
      </h3>
      {triggered.length === 0 ? (
        <GlassCard padding="sm" className="flex items-center gap-2 text-[11px] font-mono text-[#94b0d1]">
          <Info className="w-3.5 h-3.5" />
          Aucune règle déclenchée pour ce jour — surveillance nominale.
        </GlassCard>
      ) : (
        <div className="flex flex-wrap gap-2">
          {triggered.map((ruleId) => (
            <GlassCard key={ruleId} padding="sm" className="text-[11px] font-mono">
              <span className="text-[#00CFFF] font-bold">{ruleId}</span>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
};

export default AlertsView;
