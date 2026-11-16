import { ChevronDown, ChevronUp, Layers, RotateCcw, ScanLine } from 'lucide-react';
import { ANATOMICAL_SYSTEMS } from '@/anatomy/types';
import type {
  AnatomicalSystemId,
  CameraPresetId,
  DiagnosticSliceMode,
  DiagnosticState,
  LayerVisibilityState,
} from '@/anatomy/types';

interface ControlDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  layers: LayerVisibilityState;
  onToggleLayer: (id: AnatomicalSystemId) => void;
  onIsolateLayer: (id: AnatomicalSystemId) => void;
  onResetAllLayers: () => void;
  heartRateBpm: number;
  hasHeartRate: boolean;
  onChangeBpm: (bpm: number) => void;
  flowSpeed: number;
  onChangeFlowSpeed: (speed: number) => void;
  cameraPreset: CameraPresetId;
  onSelectPreset: (preset: CameraPresetId) => void;
  diagnostics: DiagnosticState;
  onToggleSlice: () => void;
  onChangeSliceMode: (mode: DiagnosticSliceMode) => void;
  onChangeSlicePos: (pos: number) => void;
}

const PRESET_OPTIONS: { id: CameraPresetId; label: string }[] = [
  { id: 'anterior', label: 'Anterior' },
  { id: 'thoracic', label: 'Thorax' },
  { id: 'lateral', label: 'Lateral' },
  { id: 'posterior', label: 'Posterior' },
];

export function ControlDock({
  collapsed,
  onToggleCollapse,
  layers,
  onToggleLayer,
  onIsolateLayer,
  onResetAllLayers,
  heartRateBpm,
  hasHeartRate,
  onChangeBpm,
  flowSpeed,
  onChangeFlowSpeed,
  cameraPreset,
  onSelectPreset,
  diagnostics,
  onToggleSlice,
  onChangeSliceMode,
  onChangeSlicePos,
}: ControlDockProps) {
  const allActive = ANATOMICAL_SYSTEMS.every((s) => layers[s.id]);
  const isAxial = diagnostics.sliceMode === 'axial';
  const sliceMin = isAxial ? 0.35 : -0.28;
  const sliceMax = isAxial ? 1.72 : 0.28;

  return (
    <div
      className="pointer-events-none fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center transition-transform duration-200 ease-out"
      style={{
        width: 'min(1080px, 95vw)',
        transform: collapsed
          ? 'translate(-50%, calc(100% - 26px))'
          : 'translate(-50%, 0)',
      }}
    >
      {/* Collapse / Expand Tab */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        className="pointer-events-auto flex items-center gap-1.5 rounded-t-lg border border-b-0 border-sky-400/20 px-3 py-1 text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        style={{ backgroundColor: 'rgba(11, 17, 32, 0.92)' }}
      >
        {collapsed ? (
          <>
            <ChevronUp className="h-3.5 w-3.5 text-sky-400" />
            <span>Show Controls (H)</span>
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5 text-sky-400" />
            <span>Hide Controls (H)</span>
          </>
        )}
      </button>

      {/* Unified Horizontal Control Dock */}
      <div
        className="pointer-events-auto w-full rounded-xl border border-sky-400/20 px-4 py-2.5 shadow-2xl space-y-2"
        style={{ backgroundColor: 'rgba(11, 17, 32, 0.92)' }}
      >
        {/* Row 1: Anatomical Systems, Heart Rate / Flow, Camera Presets */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* Anatomical Layers */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {ANATOMICAL_SYSTEMS.map((sys) => {
              const active = layers[sys.id];
              return (
                <button
                  key={sys.id}
                  type="button"
                  onClick={() => onToggleLayer(sys.id)}
                  onDoubleClick={() => onIsolateLayer(sys.id)}
                  title={`Click to toggle ${sys.label} · Double-click to isolate`}
                  aria-pressed={active}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    active
                      ? 'border-sky-400/35 bg-slate-800/90 text-slate-100'
                      : 'border-slate-800 bg-slate-950/60 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span
                    className="h-2 w-2 rounded-sm shrink-0 transition-opacity"
                    style={{
                      backgroundColor: sys.accentHex,
                      opacity: active ? 1 : 0.25,
                    }}
                    aria-hidden="true"
                  />
                  <span>{sys.label}</span>
                </button>
              );
            })}
            {!allActive && (
              <button
                type="button"
                onClick={onResetAllLayers}
                title="Show all anatomical systems"
                className="flex items-center gap-1 rounded-lg border border-slate-700/80 px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" />
                <span>All</span>
              </button>
            )}
          </div>

          {/* Cardiac BPM & Arterial Flow Sliders */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap shrink-0">
              <span className="text-slate-400">Visual BPM</span>
              <input
                type="range"
                min={45}
                max={160}
                step={1}
                value={hasHeartRate ? heartRateBpm : 60}
                disabled={!hasHeartRate}
                onChange={(e) => onChangeBpm(Number(e.target.value))}
                className="clinical-slider crimson w-20"
                aria-label="Visual model BPM"
              />
              <span className="font-mono-tabular w-14 text-right font-medium text-orange-400">
                {hasHeartRate ? `${heartRateBpm} bpm` : 'NO DATA'}
              </span>
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap shrink-0">
              <span className="text-slate-400">Flow</span>
              <input
                type="range"
                min={0.25}
                max={2.5}
                step={0.05}
                value={flowSpeed}
                onChange={(e) => onChangeFlowSpeed(Number(e.target.value))}
                className="clinical-slider w-16"
                aria-label="Arterial Flow Speed"
              />
              <span className="font-mono-tabular w-10 text-right font-medium text-sky-300">
                {flowSpeed.toFixed(2)}x
              </span>
            </label>
          </div>

          {/* Camera Orientation Presets */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-950/70 p-0.5 border border-slate-800/80">
            {PRESET_OPTIONS.map((opt) => {
              const isSelected = cameraPreset === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSelectPreset(opt.id)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    isSelected
                      ? 'bg-sky-500/20 text-sky-200'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 2: Diagnostic Anomaly Zones & Cross-Sectional Layer Spread */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-800/90 pt-2">
          <div
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1 text-xs text-slate-500"
            aria-label="Anomaly detection unavailable"
          >
            <ScanLine className="h-3.5 w-3.5" />
            <span>Détection d’anomalies indisponible</span>
          </div>

          {/* Cross-Sectional Layer Spread Slice Controls */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onToggleSlice}
              aria-pressed={diagnostics.sliceEnabled}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                diagnostics.sliceEnabled
                  ? 'border-cyan-400/40 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-800 bg-slate-950/60 text-slate-500 hover:text-slate-300'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Layer Slice</span>
            </button>

            <div className="flex items-center gap-0.5 rounded-lg bg-slate-950/70 p-0.5 border border-slate-800/80">
              {(['axial', 'sagittal'] as const).map((mode) => {
                const selected = diagnostics.sliceMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!diagnostics.sliceEnabled}
                    onClick={() => onChangeSliceMode(mode)}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      selected
                        ? 'bg-sky-500/20 text-sky-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {mode === 'axial' ? 'Axial' : 'Vertical'}
                  </button>
                );
              })}
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-300 whitespace-nowrap shrink-0">
              <span className="text-slate-400">Plane</span>
              <input
                type="range"
                min={sliceMin}
                max={sliceMax}
                step={0.01}
                disabled={!diagnostics.sliceEnabled}
                value={diagnostics.slicePos}
                onChange={(e) => onChangeSlicePos(Number(e.target.value))}
                className="clinical-slider w-28 disabled:opacity-40"
                aria-label="Cross-sectional slice plane position"
              />
              <span className="font-mono-tabular w-14 text-right font-medium text-cyan-300">
                {isAxial ? 'Y' : 'X'} {diagnostics.slicePos.toFixed(2)}m
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
