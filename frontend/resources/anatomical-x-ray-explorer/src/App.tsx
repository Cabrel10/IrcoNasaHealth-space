import { useCallback, useEffect, useState } from 'react';
import { ANATOMICAL_CATALOG } from './anatomy/catalog';
import {
  AnatomicalSystemId,
  AnomalyZoneId,
  CameraPresetId,
  DiagnosticSliceMode,
  DiagnosticState,
  LayerVisibilityState,
} from './anatomy/types';
import { AnatomyViewport } from './components/AnatomyViewport';
import { ControlDock } from './components/ControlDock';
import { InspectionDrawer } from './components/InspectionDrawer';

const DEFAULT_LAYERS: LayerVisibilityState = {
  skeletal: true,
  organs: true,
  muscular: true,
  cardiovascular: true,
  nervous: true,
  skin: true,
};

const DEFAULT_DIAGNOSTICS: DiagnosticState = {
  anomaliesEnabled: true,
  activeAnomalies: {
    liver_metabolic: true,
    left_knee_joint: true,
    right_forearm_strain: true,
  },
  sliceEnabled: true,
  sliceMode: 'axial',
  slicePos: 1.19,
};

export default function App() {
  const [layers, setLayers] = useState<LayerVisibilityState>(DEFAULT_LAYERS);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>(DEFAULT_DIAGNOSTICS);
  const [heartRateBpm, setHeartRateBpm] = useState<number>(72);
  const [flowSpeed, setFlowSpeed] = useState<number>(1.0);
  const [cameraPreset, setCameraPreset] = useState<CameraPresetId>('anterior');
  const [presetTrigger, setPresetTrigger] = useState<number>(0);
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [hoveredPartId, setHoveredPartId] = useState<string | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);

  // Keyboard shortcut 'H' to toggle pure-visual mode (hides dock & overlays)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
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

  const handleToggleAnomalies = useCallback(() => {
    setDiagnostics((prev) => ({ ...prev, anomaliesEnabled: !prev.anomaliesEnabled }));
  }, []);

  const handleToggleAnomalyZone = useCallback((zoneId: AnomalyZoneId) => {
    setDiagnostics((prev) => ({
      ...prev,
      activeAnomalies: {
        ...prev.activeAnomalies,
        [zoneId]: !prev.activeAnomalies[zoneId],
      },
    }));
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

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#0B1120]">
      {/* Full-Viewport 3D Medical X-Ray Scene */}
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

      {/* Minimal Top-Left Header Context (auto-hidden when controls collapsed) */}
      <div
        className={`pointer-events-none absolute left-5 top-4 z-10 transition-opacity duration-200 ${
          dockCollapsed ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <h1 className="text-sm font-semibold tracking-tight text-slate-100">
          Anatomical X-Ray Explorer
        </h1>
        <p className="mt-0.5 text-xs text-slate-400">
          {hoveredInfo
            ? `${hoveredInfo.name} · ${hoveredInfo.region}`
            : 'Click any anatomical structure to inspect · Drag to orbit'}
        </p>
      </div>

      {/* Dismissible Clinical Inspection Drawer (Only when a 3D part is selected) */}
      {!dockCollapsed && (
        <InspectionDrawer
          partId={selectedPartId}
          diagnostics={diagnostics}
          onClose={() => setSelectedPartId(null)}
          onIsolateSystem={handleIsolateLayer}
        />
      )}

      {/* Collapsible Unified Bottom Dock */}
      <ControlDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((prev) => !prev)}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        onIsolateLayer={handleIsolateLayer}
        onResetAllLayers={handleResetAllLayers}
        heartRateBpm={heartRateBpm}
        onChangeBpm={setHeartRateBpm}
        flowSpeed={flowSpeed}
        onChangeFlowSpeed={setFlowSpeed}
        cameraPreset={cameraPreset}
        onSelectPreset={handleSelectPreset}
        diagnostics={diagnostics}
        onToggleAnomalies={handleToggleAnomalies}
        onToggleAnomalyZone={handleToggleAnomalyZone}
        onToggleSlice={handleToggleSlice}
        onChangeSliceMode={handleChangeSliceMode}
        onChangeSlicePos={handleChangeSlicePos}
      />
    </main>
  );
}
