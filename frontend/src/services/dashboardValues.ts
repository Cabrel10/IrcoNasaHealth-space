// ─── Dashboard value resolution ─────────────────────────────────────────────
// Single source of truth for turning IRCO API indicators into UI display
// values. Rule: a missing value is NEVER rendered as a number (never "0").
import { INDICATOR_IDS } from '@/constants/metrics';
import type { DashboardIndicator } from './api';

export type IndicatorMap = Map<string, DashboardIndicator>;

export function buildIndicatorMap(indicators?: DashboardIndicator[]): IndicatorMap {
  return new Map<string, DashboardIndicator>((indicators ?? []).map((i) => [i.id, i]));
}

export const fmtValue = (v: number | null | undefined): string | null =>
  v === null || v === undefined || !Number.isFinite(Number(v))
    ? null
    : String(Number(v));

export function indicatorForMetric(
  map: IndicatorMap,
  metricId: string,
): DashboardIndicator | undefined {
  const primary = (INDICATOR_IDS[metricId] ?? [])[0];
  return primary ? map.get(primary) : undefined;
}

export function dataClassLabel(dataClass?: string | null): string {
  switch (dataClass) {
    case 'live':
      return 'LIVE';
    case 'public_data':
      return 'PUBLIC DATA';
    case 'measured_real':
      return 'MEASURED REAL';
    case 'analog':
      return 'ANALOG DATA';
    case 'synthetic':
      return 'SYNTHETIC';
    default:
      return 'UNAVAILABLE';
  }
}

export function dataClassVariant(
  dataClass?: string | null,
): 'measured' | 'info' | 'synthetic' | 'nodata' {
  switch (dataClass) {
    case 'live':
      return 'measured';
    case 'public_data':
      return 'info';
    case 'measured_real':
      return 'measured';
    case 'analog':
      return 'info';
    case 'synthetic':
      return 'synthetic';
    default:
      return 'nodata';
  }
}

export function thresholdStatusLabel(status?: string | null): string {
  switch (status) {
    case 'validated':
      return 'VALIDATED';
    case 'provisional':
      return 'PROVISIONAL';
    case 'illustrative':
      return 'ILLUSTRATIVE';
    case 'not_applicable':
      return 'NOT APPLICABLE';
    default:
      return 'UNAVAILABLE';
  }
}

export function indicatorReferenceLabel(
  indicator?: DashboardIndicator,
): string {
  if (!indicator?.thresholds) return 'UNAVAILABLE';
  const minimum = indicator.thresholds.reference_min;
  const maximum = indicator.thresholds.reference_max;
  if (minimum == null && maximum == null) return 'UNAVAILABLE';
  const range =
    minimum != null && maximum != null
      ? `${minimum}–${maximum}`
      : minimum != null
        ? `≥ ${minimum}`
        : `≤ ${maximum}`;
  return `${range} ${indicator.unit}`;
}

export function observationTimeLabel(timestamp?: string | null): string {
  if (!timestamp) return 'UNAVAILABLE';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'INVALID TIMESTAMP';
  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function ageLabel(ageSeconds?: number | null): string {
  if (ageSeconds == null || !Number.isFinite(ageSeconds)) return 'UNAVAILABLE';
  if (ageSeconds < 0) return 'INVALID AGE';
  if (ageSeconds < 60) return `${ageSeconds} s`;
  if (ageSeconds < 3600) return `${Math.floor(ageSeconds / 60)} min`;
  return `${Math.floor(ageSeconds / 3600)} h ${Math.floor((ageSeconds % 3600) / 60)} min`;
}

/** Display text for a UI metric id; null means "no backend data" (show NO DATA). */
export function metricValueText(map: IndicatorMap, metricId: string): string | null {
  const ids = INDICATOR_IDS[metricId] ?? [];
  if (ids.length === 0) return null;
  const values = ids.map((id) => map.get(id)?.value ?? null);
  if (values.some((v) => v === null || v === undefined)) return null;
  if (ids.length === 2) return `${fmtValue(values[0])}/${fmtValue(values[1])}`;
  return fmtValue(values[0]);
}

/** History points (HH:MM from ISO timestamp) for the primary indicator. */
export function metricHistory(
  map: IndicatorMap,
  metricId: string,
): Array<{ time: string; value: number }> {
  const primary = (INDICATOR_IDS[metricId] ?? [])[0];
  const hist = primary ? map.get(primary)?.history ?? [] : [];
  return hist.map((h) => ({ time: h.timestamp.slice(11, 16), value: Number(h.value) }));
}

export type IndicatorStatusVariant = 'nominal' | 'warning' | 'critical' | 'nodata';

export function metricStatusVariant(map: IndicatorMap, metricId: string): IndicatorStatusVariant {
  const indicator = indicatorForMetric(map, metricId);
  const st = indicator?.data_status ?? indicator?.status;
  if (st === 'fresh') return 'nominal';
  if (st === 'stale') return 'warning';
  if (st === 'suspect' || st === 'invalid') return 'critical';
  return 'nodata';
}

const STATUS_TEXT: Record<string, string> = {
  fresh: 'FRESH',
  stale: 'STALE',
  suspect: 'SUSPECT',
  invalid: 'INVALID',
  no_data: 'NO DATA',
};

export function metricStatusText(map: IndicatorMap, metricId: string): string {
  const indicator = indicatorForMetric(map, metricId);
  const st = indicator?.data_status ?? indicator?.status;
  return STATUS_TEXT[st ?? 'no_data'] ?? 'NO DATA';
}

export function metricBaseline(map: IndicatorMap, metricId: string): string | null {
  const primary = (INDICATOR_IDS[metricId] ?? [])[0];
  const b = primary ? map.get(primary)?.baseline : undefined;
  return b ? fmtValue(Number(b.mean.toFixed(2))) : null;
}

export function metricBaselineSd(map: IndicatorMap, metricId: string): string | null {
  const primary = (INDICATOR_IDS[metricId] ?? [])[0];
  const b = primary ? map.get(primary)?.baseline : undefined;
  return b ? `±${Number(b.standard_deviation.toFixed(2))}` : null;
}

/** global.level → UI badge variant + label. */
export function globalLevelView(level: string | undefined): {
  variant: 'nominal' | 'warning' | 'critical' | 'nodata';
  text: string;
} {
  switch (level) {
    case 'green':
      return { variant: 'nominal', text: 'NOMINAL' };
    case 'amber':
      return { variant: 'warning', text: 'CAUTION' };
    case 'red':
      return { variant: 'critical', text: 'CRITICAL' };
    default:
      return { variant: 'nodata', text: 'NO DATA' };
  }
}
