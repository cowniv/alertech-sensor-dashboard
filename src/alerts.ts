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
  else if (r.temperature >= t.temperatureWarn)
    out.push({ kind: "temperature", severity: "warning", message: `Temperature at ${r.temperature}°C` });

  if (r.smoke >= t.smokeCritical)
    out.push({ kind: "smoke", severity: "critical", message: `Smoke at ${r.smoke} ppm` });
  else if (r.smoke >= t.smokeWarn)
    out.push({ kind: "smoke", severity: "warning", message: `Smoke at ${r.smoke} ppm` });

  if (r.humidity <= t.humidityLow)
    out.push({ kind: "humidity", severity: "info", message: `Low humidity (${r.humidity}%)` });
  return out;
}

export function statusFor(r: Reading | undefined, t: Thresholds, offline: boolean): DeviceStatus {
  if (offline || !r) return "offline";
  const checks = evaluate(r, t);
  if (checks.some((c) => c.severity === "critical")) return "critical";
  if (checks.some((c) => c.severity === "warning")) return "warning";
  return "normal";
}

