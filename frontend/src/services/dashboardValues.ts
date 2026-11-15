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
  v === null || v === undefined ? null : String(Number(v));

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
  const primary = (INDICATOR_IDS[metricId] ?? [])[0];
  const st = primary ? map.get(primary)?.status : undefined;
  if (st === 'fresh') return 'nominal';
  if (st === 'stale') return 'warning';
  if (st === 'suspect') return 'critical';
  return 'nodata';
}

const STATUS_TEXT: Record<string, string> = {
  fresh: 'FRESH',
  stale: 'STALE',
  suspect: 'SUSPECT',
  no_data: 'NO DATA',
};

export function metricStatusText(map: IndicatorMap, metricId: string): string {
  const primary = (INDICATOR_IDS[metricId] ?? [])[0];
  const st = primary ? map.get(primary)?.status : undefined;
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
