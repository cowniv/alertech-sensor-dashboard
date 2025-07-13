import type { Alert, AlertKind, DeviceStatus, Reading, Severity, Thresholds } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = {
  temperatureWarn: 45,
  temperatureCritical: 60,
  smokeWarn: 300,
  smokeCritical: 700,
  humidityLow: 30,
  offlineAfterSec: 5,
};

