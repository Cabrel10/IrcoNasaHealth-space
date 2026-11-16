import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  Heart,
  RotateCcw,
  Shield,
  Sparkles,
} from 'lucide-react';
import { ANATOMICAL_CATALOG } from '@/anatomy/catalog';
import type {
  AnatomicalSystemId,
  CameraPresetId,
  DiagnosticSliceMode,
  DiagnosticState,
  LayerVisibilityState,
} from '@/anatomy/types';
import { AnatomyViewport } from '@/components/anatomy/AnatomyViewport';
import { ControlDock } from '@/components/anatomy/ControlDock';
import { InspectionDrawer } from '@/components/anatomy/InspectionDrawer';
import { useMissionStore } from '@/stores/useMissionStore';
import {
  buildIndicatorMap,
  dataClassLabel,
  dataClassVariant,
} from '@/services/dashboardValues';
import { StatusPill } from '@/components/ui/StatusPill';

const DEFAULT_LAYERS: LayerVisibilityState = {
  skeletal: true,
  organs: true,
  muscular: true,
  cardiovascular: true,
  nervous: true,
  skin: true,
};

const DEFAULT_DIAGNOSTICS: DiagnosticState = {
  anomaliesEnabled: false,
  activeAnomalies: {
    liver_metabolic: false,
    left_knee_joint: false,
    right_forearm_strain: false,
  },
  sliceEnabled: false,
  sliceMode: 'axial',
  slicePos: 1.19,
};

interface AnatomyViewProps {
  initialSystem?: AnatomicalSystemId | null;
  initialPartId?: string | null;
}

export const AnatomyView: React.FC<AnatomyViewProps> = ({
  initialSystem,
  initialPartId,
}) => {
  const {
    dashboard,
    setActiveNav,
    selectedMetricId,
  } = useMissionStore();

  // Read real heart rate from IRCO API indicators
  const indicatorMap = useMemo(
    () => buildIndicatorMap(dashboard?.indicators),
    [dashboard?.indicators],
  );
  const rawHeartRate = indicatorMap.get('heart_rate')?.value;
  const heartRateIndicator = indicatorMap.get('heart_rate');
  const realHeartRateBpm =
    typeof rawHeartRate === 'number' && !isNaN(rawHeartRate) && rawHeartRate > 0
      ? Math.round(rawHeartRate)
      : null;

  // Real vigilance and alerts
  const globalLevel = dashboard?.global?.level ?? 'no_data';
  const subjectId = dashboard?.subject_id ?? 'A-01';

  // State
  const [layers, setLayers] = useState<LayerVisibilityState>(() => {
    if (initialSystem) {
      return {
        skeletal: initialSystem === 'skeletal',
        organs: initialSystem === 'organs',
        muscular: initialSystem === 'muscular',
        cardiovascular: initialSystem === 'cardiovascular',
        nervous: initialSystem === 'nervous',
        skin: initialSystem === 'skin',
      };
    }
    return DEFAULT_LAYERS;
  });

  const [diagnostics, setDiagnostics] = useState<DiagnosticState>(DEFAULT_DIAGNOSTICS);
  const [heartRateBpm, setHeartRateBpm] = useState<number>(realHeartRateBpm ?? 0);
  const [flowSpeed, setFlowSpeed] = useState<number>(0);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>(() => {
    if (initialSystem === 'cardiovascular' || selectedMetricId === 'heart-rate') {
      return 'thoracic';
    }
    return 'anterior';
  });
  const [presetTrigger, setPresetTrigger] = useState<number>(0);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(initialPartId ?? null);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);

  // Sync with real backend telemetry when it changes
  useEffect(() => {
    setHeartRateBpm(realHeartRateBpm ?? 0);
  }, [realHeartRateBpm]);

  // If initial props change
  useEffect(() => {
    if (initialSystem) {
      setLayers({
        skeletal: initialSystem === 'skeletal',
        organs: initialSystem === 'organs',
        muscular: initialSystem === 'muscular',
        cardiovascular: initialSystem === 'cardiovascular',
        nervous: initialSystem === 'nervous',
        skin: initialSystem === 'skin',
      });
      if (initialSystem === 'cardiovascular') {
        setCameraPreset('thoracic');
        setPresetTrigger((n) => n + 1);
        setSelectedPartId('heart');
      }
    }
  }, [initialSystem]);

  // Keyboard shortcut 'H' to toggle dock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.key === 'Escape') {
        setSelectedPartId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleToggleLayer = useCallback((id: AnatomicalSystemId) => {
    setLayers((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleIsolateLayer = useCallback((id: AnatomicalSystemId) => {
    setLayers({
      skeletal: id === 'skeletal',
      organs: id === 'organs',
      muscular: id === 'muscular',
      cardiovascular: id === 'cardiovascular',
      nervous: id === 'nervous',
      skin: id === 'skin',
    });
  }, []);

  const handleResetAllLayers = useCallback(() => {
    setLayers(DEFAULT_LAYERS);
  }, []);

  const handleSelectPreset = useCallback((preset: CameraPresetId) => {
    setCameraPreset(preset);
    setPresetTrigger((n) => n + 1);
  }, []);

  const handleToggleSlice = useCallback(() => {
    setDiagnostics((prev) => ({ ...prev, sliceEnabled: !prev.sliceEnabled }));
  }, []);

  const handleChangeSliceMode = useCallback((mode: DiagnosticSliceMode) => {
    setDiagnostics((prev) => ({
      ...prev,
      sliceMode: mode,
      slicePos: mode === 'axial' ? 1.19 : 0.04,
    }));
  }, []);

  const handleChangeSlicePos = useCallback((pos: number) => {
    setDiagnostics((prev) => ({ ...prev, slicePos: pos }));
  }, []);

  const hoveredInfo = hoveredPartId ? ANATOMICAL_CATALOG[hoveredPartId] : null;

  const vigilanceColor =
    globalLevel === 'red'
      ? '#ef4444'
      : globalLevel === 'amber'
      ? '#f59e0b'
      : globalLevel === 'green'
        ? '#22c55e'
        : '#94a3b8';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#070e1c] select-none" data-testid="anatomy-view">
      {/* 1. Full-Viewport 3D Medical X-Ray Scene */}
      <AnatomyViewport
        layers={layers}
        heartRateBpm={heartRateBpm}
        flowSpeed={flowSpeed}
        cameraPreset={cameraPreset}
        presetTrigger={presetTrigger}
        selectedPartId={selectedPartId}
        diagnostics={diagnostics}
        hideChrome={dockCollapsed}
        onSelectPart={setSelectedPartId}
        onHoverPart={setHoveredPartId}
        onResetAnterior={() => handleSelectPreset('anterior')}
      />

      {/* 2. Top-Left SpaceMed Command Bar */}
      <div
        className={`pointer-events-auto absolute left-6 top-5 z-20 flex flex-col gap-2 transition-opacity duration-300 ${
          dockCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveNav('mission-overview')}
            className="flex items-center gap-1.5 rounded-lg border border-[#00CFFF]/30 bg-[#081A30]/85 px-3 py-1.5 text-xs font-mono text-[#00CFFF] hover:bg-[#00CFFF]/20 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Cockpit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveNav('crew-health')}
            className="flex items-center gap-1.5 rounded-lg border border-[#00CFFF]/30 bg-[#081A30]/85 px-3 py-1.5 text-xs font-mono text-[#00CFFF] hover:bg-[#00CFFF]/20 hover:text-white transition-colors cursor-pointer"
          >
            <Activity className="h-3.5 w-3.5" />
            <span>Santé Équipage</span>
          </button>
        </div>

        {/* Title and Telemetry Context */}
        <div className="rounded-xl border border-sky-400/20 bg-[#081A30]/85 p-3 backdrop-blur-md shadow-xl min-w-[280px]">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xs font-heading font-bold uppercase tracking-wider text-white">
              Mannequin Anatomique 3D
            </h1>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold"
              style={{
                backgroundColor: `${vigilanceColor}20`,
                color: vigilanceColor,
                border: `1px solid ${vigilanceColor}50`,
              }}
            >
              <Shield className="h-2.5 w-2.5" />
              {globalLevel.toUpperCase()}
            </span>
          </div>

          <div className="mt-1 flex items-center gap-2 text-[11px] font-mono text-slate-300">
            <span>Sujet : {subjectId}</span>
            <span>·</span>
            <span className="flex items-center gap-1 font-bold">
              <Heart className="h-3 w-3" />
              {realHeartRateBpm === null
                ? '— BPM · Aucune donnée'
                : `${realHeartRateBpm} BPM`}
              <StatusPill
                label={dataClassLabel(realHeartRateBpm === null ? null : heartRateIndicator?.data_class)}
                variant={dataClassVariant(realHeartRateBpm === null ? null : heartRateIndicator?.data_class)}
                showDot={false}
              />
            </span>
          </div>

          <p className="mt-1.5 text-[10px] text-slate-400">
            Schéma illustratif; seule la fréquence cardiaque est reliée à la télémétrie.
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {hoveredInfo
              ? `${hoveredInfo.name} · ${hoveredInfo.region}`
              : 'Cliquez sur une structure 3D pour l’inspecter · Rotation libre à la souris'}
          </p>

          {realHeartRateBpm !== null && heartRateBpm !== realHeartRateBpm && (
            <button
              type="button"
              onClick={() => setHeartRateBpm(realHeartRateBpm)}
              className="mt-2 flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:underline cursor-pointer"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Réinitialiser la visualisation sur la mesure API ({realHeartRateBpm} BPM)</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Clinical Inspection Drawer */}
      {!dockCollapsed && (
        <InspectionDrawer
          partId={selectedPartId}
          onClose={() => setSelectedPartId(null)}
          onIsolateSystem={handleIsolateLayer}
        />
      )}

      {/* 4. Collapsible Bottom Control Dock */}
      <ControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        onIsolateLayer={handleIsolateLayer}
        onResetAllLayers={handleResetAllLayers}
        heartRateBpm={heartRateBpm}
        hasHeartRate={realHeartRateBpm !== null}
        onChangeBpm={setHeartRateBpm}
        flowSpeed={flowSpeed}
        onChangeFlowSpeed={setFlowSpeed}
        cameraPreset={cameraPreset}
        onSelectPreset={handleSelectPreset}
        diagnostics={diagnostics}
        onToggleSlice={handleToggleSlice}
        onChangeSliceMode={handleChangeSliceMode}
        onChangeSlicePos={handleChangeSlicePos}
      />
    </div>
  );
};
