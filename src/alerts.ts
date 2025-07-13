import type { Alert, AlertKind, DeviceStatus, Reading, Severity, Thresholds } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = {
  temperatureWarn: 45,
  temperatureCritical: 60,
  smokeWarn: 300,
  smokeCritical: 700,
  humidityLow: 30,
  offlineAfterSec: 5,
};

export interface Check {
  kind: AlertKind;
  severity: Severity;
  message: string;
}

/** Pure function: which thresholds does this reading break? */
export function evaluate(r: Reading, t: Thresholds): Check[] {
  const out: Check[] = [];
  if (r.temperature >= t.temperatureCritical)
    out.push({ kind: "temperature", severity: "critical", message: `Temperature at ${r.temperature}°C` });
